/**
 * ============================================================================
 * JITYAI STORE-SIDE CONNECTOR
 * ============================================================================
 * Purpose: Lightweight script running on store computer to sync POS data
 * Watches folder for CSV exports and pushes to cloud API hourly
 * ============================================================================
 */

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const chokidar = require('chokidar');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    // API Configuration
    API_URL: process.env.JITYAI_API_URL || 'https://your-cloud-domain.com',
    API_KEY: process.env.JITYAI_API_KEY || 'YOUR_API_KEY_HERE',
    STORE_ID: process.env.JITYAI_STORE_ID || 'STORE_001',

    // Local Folder Configuration
    WATCH_FOLDER: process.env.WATCH_FOLDER || './pos_exports',
    PROCESSED_FOLDER: process.env.PROCESSED_FOLDER || './pos_exports/processed',
    FAILED_FOLDER: process.env.FAILED_FOLDER || './pos_exports/failed',

    // Sync Configuration
    SYNC_INTERVAL_HOURS: parseInt(process.env.SYNC_INTERVAL_HOURS || '1'),
    AUTO_SYNC: process.env.AUTO_SYNC !== 'false',

    // File Pattern
    FILE_PATTERN: /\.(csv|xlsx)$/i,

    // Retry Configuration
    MAX_RETRIES: 3,
    RETRY_DELAY_MS: 5000
};

// ============================================================================
// LOGGING
// ============================================================================

function log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const prefix = {
        'INFO': '✓',
        'WARN': '⚠',
        'ERROR': '✗'
    }[level] || 'ℹ';

    console.log(`[${timestamp}] ${prefix} ${message}`);
}

// ============================================================================
// FILE OPERATIONS
// ============================================================================

async function ensureDir(dir) {
    try {
        await fs.mkdir(dir, { recursive: true });
    } catch (error) {
        if (error.code !== 'EEXIST') throw error;
    }
}

async function moveFile(sourcePath, targetFolder) {
    const fileName = path.basename(sourcePath);
    const targetPath = path.join(targetFolder, fileName);

    await ensureDir(targetFolder);
    await fs.rename(sourcePath, targetPath);

    return targetPath;
}

async function getFilesInFolder(folder) {
    try {
        const files = await fs.readdir(folder);
        return files
            .filter(file => CONFIG.FILE_PATTERN.test(file))
            .map(file => path.join(folder, file));
    } catch (error) {
        if (error.code === 'ENOENT') {
            await ensureDir(folder);
            return [];
        }
        throw error;
    }
}

// ============================================================================
// API COMMUNICATION
// ============================================================================

async function uploadFile(filePath) {
    const FormData = require('form-data');
    const form = new FormData();

    const fileStream = require('fs').createReadStream(filePath);
    const fileName = path.basename(filePath);

    form.append('file', fileStream, fileName);
    form.append('storeId', CONFIG.STORE_ID);

    const response = await axios.post(
        `${CONFIG.API_URL}/api/sync/upload`,
        form,
        {
            headers: {
                ...form.getHeaders(),
                'X-API-Key': CONFIG.API_KEY
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        }
    );

    return response.data;
}

async function uploadFileWithRetry(filePath, attempt = 1) {
    try {
        log(`Uploading ${path.basename(filePath)} (attempt ${attempt}/${CONFIG.MAX_RETRIES})`);

        const result = await uploadFile(filePath);

        log(`✓ Upload successful: ${result.message || 'OK'}`, 'INFO');
        return { success: true, result };

    } catch (error) {
        const errorMsg = error.response?.data?.error || error.message;

        if (attempt < CONFIG.MAX_RETRIES) {
            log(`Upload failed: ${errorMsg}. Retrying in ${CONFIG.RETRY_DELAY_MS / 1000}s...`, 'WARN');
            await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY_MS));
            return uploadFileWithRetry(filePath, attempt + 1);
        }

        log(`Upload failed after ${CONFIG.MAX_RETRIES} attempts: ${errorMsg}`, 'ERROR');
        return { success: false, error: errorMsg };
    }
}

// ============================================================================
// SYNC LOGIC
// ============================================================================

async function processFile(filePath) {
    const fileName = path.basename(filePath);

    log(`Processing file: ${fileName}`);

    try {
        // Upload file to cloud
        const result = await uploadFileWithRetry(filePath);

        if (result.success) {
            // Move to processed folder
            const processedPath = await moveFile(filePath, CONFIG.PROCESSED_FOLDER);
            log(`Moved to processed: ${processedPath}`, 'INFO');
            return true;
        } else {
            // Move to failed folder
            const failedPath = await moveFile(filePath, CONFIG.FAILED_FOLDER);
            log(`Moved to failed: ${failedPath}`, 'ERROR');
            return false;
        }

    } catch (error) {
        log(`Critical error processing ${fileName}: ${error.message}`, 'ERROR');

        try {
            await moveFile(filePath, CONFIG.FAILED_FOLDER);
        } catch (moveError) {
            log(`Failed to move file: ${moveError.message}`, 'ERROR');
        }

        return false;
    }
}

async function syncAll() {
    log('='.repeat(60));
    log('Starting sync cycle...');

    const files = await getFilesInFolder(CONFIG.WATCH_FOLDER);

    if (files.length === 0) {
        log('No files to process');
        log('='.repeat(60));
        return;
    }

    log(`Found ${files.length} file(s) to process`);

    let successCount = 0;
    let failCount = 0;

    for (const file of files) {
        const success = await processFile(file);
        if (success) successCount++;
        else failCount++;
    }

    log(`Sync complete: ${successCount} succeeded, ${failCount} failed`);
    log('='.repeat(60));
}

// ============================================================================
// WATCH MODE
// ============================================================================

function startWatchMode() {
    log('Starting file watch mode...');
    log(`Watching folder: ${CONFIG.WATCH_FOLDER}`);

    const watcher = chokidar.watch(CONFIG.WATCH_FOLDER, {
        ignored: /(^|[\/\\])\../, // ignore dotfiles
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
            stabilityThreshold: 2000,
            pollInterval: 100
        }
    });

    watcher
        .on('add', async (filePath) => {
            if (CONFIG.FILE_PATTERN.test(filePath)) {
                log(`New file detected: ${path.basename(filePath)}`);
                await processFile(filePath);
            }
        })
        .on('error', error => log(`Watcher error: ${error}`, 'ERROR'));

    log('File watcher active ✓');
}

// ============================================================================
// SCHEDULED SYNC
// ============================================================================

function startScheduledSync() {
    const intervalMs = CONFIG.SYNC_INTERVAL_HOURS * 60 * 60 * 1000;

    log(`Starting scheduled sync (every ${CONFIG.SYNC_INTERVAL_HOURS} hour(s))`);

    // Run immediately
    syncAll();

    // Schedule recurring
    setInterval(syncAll, intervalMs);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
    console.log('\n' + '='.repeat(60));
    console.log('JITYAI STORE-SIDE CONNECTOR');
    console.log('='.repeat(60));
    console.log(`Store ID: ${CONFIG.STORE_ID}`);
    console.log(`API URL: ${CONFIG.API_URL}`);
    console.log(`Watch Folder: ${CONFIG.WATCH_FOLDER}`);
    console.log(`Sync Interval: ${CONFIG.SYNC_INTERVAL_HOURS} hour(s)`);
    console.log('='.repeat(60) + '\n');

    // Ensure folders exist
    await ensureDir(CONFIG.WATCH_FOLDER);
    await ensureDir(CONFIG.PROCESSED_FOLDER);
    await ensureDir(CONFIG.FAILED_FOLDER);

    // Start file watcher
    startWatchMode();

    // Start scheduled sync
    if (CONFIG.AUTO_SYNC) {
        startScheduledSync();
    }

    log('Connector started successfully ✓');
    log('Press Ctrl+C to stop\n');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    log('\nShutting down connector...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    log('\nShutting down connector...');
    process.exit(0);
});

// Start
main().catch(error => {
    log(`Fatal error: ${error.message}`, 'ERROR');
    process.exit(1);
});
