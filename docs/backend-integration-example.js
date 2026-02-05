/**
 * BACKEND API INTEGRATION
 * Save onboarding data to database instead of localStorage
 */

// Update confirmOnboarding() function in onboarding-ui.js

async function confirmOnboarding() {
    try {
        // Show loading state
        const confirmBtn = event.target;
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Saving...';

        // Send to backend API
        const response = await fetch('/api/onboarding/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer YOUR_TOKEN_HERE' // If using auth
            },
            body: JSON.stringify({
                storeId: storeContext.storeId,
                storeName: storeContext.storeName,
                location: storeContext.location,
                storeType: storeContext.storeType,

                // All mapped items with category_id
                items: onboardingResult.items,

                // Metadata
                batchId: onboardingResult.batchId,
                onboardingDate: onboardingResult.onboardingDate,
                processingTimeMs: onboardingResult.processingTimeMs,

                // Quality metrics
                qualityScore: onboardingResult.qualityReport.overall,
                qualityGrade: onboardingResult.qualityReport.grade,

                // Stats
                stats: onboardingResult.stats,

                // Errors/warnings
                errorReport: onboardingResult.errorReport
            })
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        const result = await response.json();
        console.log('✅ Data saved to database:', result);

        // Also keep in localStorage as backup
        localStorage.setItem('onboardingResult', JSON.stringify(onboardingResult));
        localStorage.setItem('storeInventory', JSON.stringify(onboardingResult.items));

        // Show success
        showStep('complete');
        document.getElementById('final-item-count').textContent = onboardingResult.stats.totalItems;

    } catch (error) {
        console.error('❌ Failed to save to database:', error);

        // Fallback to localStorage only
        const retry = confirm(
            'Failed to save to server. Save locally instead?\n\n' +
            'Note: Data will only be available in this browser.'
        );

        if (retry) {
            localStorage.setItem('onboardingResult', JSON.stringify(onboardingResult));
            localStorage.setItem('storeInventory', JSON.stringify(onboardingResult.items));
            showStep('complete');
            document.getElementById('final-item-count').textContent = onboardingResult.stats.totalItems;
        } else {
            // Re-enable button
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Confirm & Complete Onboarding';
        }
    }
}
