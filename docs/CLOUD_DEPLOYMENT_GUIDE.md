# JityAI Cloud Deployment Guide
**Version:** 2.0 (Cloud-Ready)  
**Target:** Single VM Production Deployment  
**Date:** 2026-02-04

---

## 📋 PRE-DEPLOYMENT CHECKLIST

### System Requirements
- [  ] Ubuntu 20.04+ or CentOS 8+ VM
- [  ] **Minimum (Small Scale < 10 stores):** 2 vCPU cores, 4GB RAM, 25GB SSD
- [  ] **Recommended (Scaling up):** 4 CPU cores, 8GB RAM, 50GB SSD
- [  ] Static IP address assigned
- [  ] Domain name configured (e.g., `app.jityai.com`)
- [  ] SSL certificate ready (Let's Encrypt recommended)

### Software Dependencies
- [  ] Node.js 18+ installed
- [  ] PostgreSQL 14+ installed
- [  ] Nginx installed
- [  ] PM2 installed globally
- [  ] Git installed

---

## 🚀 STEP-BY-STEP DEPLOYMENT

### **Step 1: Server Setup**

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Install Nginx
sudo apt install -y nginx

# Install PM2
sudo npm install -g pm2

# Install Git
sudo apt install -y git
```

### **Step 2: Create Application User**

```bash
# Create jityai user
sudo adduser jityai --disabled-password

# Add to sudo group (if needed)
sudo usermod -aG sudo jityai

# Switch to jityai user
sudo su - jityai
```

### **Step 3: Deploy Application Code**

```bash
# Create application directory
mkdir -p ~/jityai-app
cd ~/jityai-app

# Clone repository (or copy files)
# Option A: Git
git clone https://your-repo.git .

# Option B: SCP from local machine
# From local: scp -r /path/to/AI_Store_Manager/* jityai@your-server:~/jityai-app/

# Install dependencies
npm install

# Install additional auth dependencies
npm install jsonwebtoken bcrypt axios chokidar form-data
```

### **Step 4: Database Setup**

```bash
# Switch to postgres user
sudo -i -u postgres

# Create database
createdb ai_store_manager

# Create database user
psql -c "CREATE USER jityai WITH PASSWORD 'CHANGE_ME_SECURE_PASSWORD';"
psql -c "GRANT ALL PRIVILEGES ON DATABASE ai_store_manager TO jityai;"

# Exit postgres user
exit

# Run schema (as jityai user)
psql -U jityai -d ai_store_manager -f ~/jityai-app/database/schema.sql

# Run migration (if upgrading existing database)
psql -U jityai -d ai_store_manager -f ~/jityai-app/database/migrate-add-auth.sql
```

### **Step 5: Environment Configuration**

Create `.env` file:

```bash
cd ~/jityai-app
nano .env
```

Paste the following (update values):

```env
# Server Configuration
NODE_ENV=production
PORT=3000

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ai_store_manager
DB_USER=jityai
DB_PASSWORD=CHANGE_ME_SECURE_PASSWORD

# Authentication
JWT_SECRET=GENERATE_RANDOM_256_BIT_SECRET_KEY_HERE

# AI Configuration
GEMINI_API_KEY=YOUR_GEMINI_API_KEY_HERE

# Application Settings
LOG_LEVEL=info
```

**Generate JWT Secret:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### **Step 6: Create Admin User**

```bash
# Generate admin password hash
node -e "const bcrypt = require('bcrypt'); bcrypt.hash('AdminPassword123!', 10).then(h => console.log(h));"

# Update the PLACEHOLDER in migration script with the hash, then:
psql -U jityai -d ai_store_manager -c "
UPDATE users 
SET password_hash = 'THE_BCRYPT_HASH_FROM_ABOVE' 
WHERE email = 'admin@jityai.com';
"
```

### **Step 7: Generate API Keys for Stores**

```bash
# For each store, generate API key
node ~/jityai-app/scripts/generate-api-key.js STORE_001 365

# Save the generated keys securely!
```

### **Step 8: PM2 Process Management**

Create PM2 ecosystem file:

```bash
nano ~/jityai-app/ecosystem.config.js
```

Paste:

```javascript
module.exports = {
  apps: [{
    name: 'jityai',
    script: './server.js',
    instances: 1, // Start with 1 to avoid duplicate job execution. Scale after adding DB locks.
    exec_mode: 'fork', // Or 'cluster' with 1 instance, but fork is simpler for launch
    env: {
      NODE_ENV: 'production'
    },
    error_file: '/home/jityai/logs/jityai-error.log',
    out_file: '/home/jityai/logs/jityai-out.log',
    time: true,
    max_memory_restart: '1G'
  }]
};
```

Start application:

```bash
# Create logs directory
mkdir -p ~/logs

# Start with PM2
cd ~/jityai-app
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Run the command PM2 outputs

# Check status
pm2 status
pm2 logs jityai
```

### **Step 9: Nginx Configuration**

```bash
sudo nano /etc/nginx/sites-available/jityai
```

Paste:

```nginx
# HTTP (redirect to HTTPS)
server {
    listen 80;
    server_name app.jityai.com;
    
    location / {
        return 301 https://$server_name$request_uri;
    }
}

# HTTPS
server {
    listen 443 ssl http2;
    server_name app.jityai.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/app.jityai.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.jityai.com/privkey.pem;
    
    # SSL Security
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
    
    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    
    # Client Upload Limits (Must match Multer config)
    client_max_body_size 50M;
    
    # Static Files
    location /static {
        alias /home/jityai/jityai-app/public;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # Proxy to Node.js
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # Health Check (Internal path is /api/health)
    location /health {
        proxy_pass http://localhost:3000/api/health;
        access_log off;
    }
}
```

Enable and test:

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/jityai /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx

# Enable on boot
sudo systemctl enable nginx
```

### **Step 10: SSL Certificate (Let's Encrypt)**

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d app.jityai.com

# Test auto-renewal
sudo certbot renew --dry-run
```

### **Step 11: Database Backups**

Create backup script:

```bash
sudo nano /usr/local/bin/jityai-backup.sh
```

Paste:

```bash
#!/bin/bash
BACKUP_DIR="/home/jityai/backups"
DATE=$(date +%Y%m%d-%H%M%S)
DB_NAME="ai_store_manager"

mkdir -p $BACKUP_DIR

# Database backup
pg_dump -U jityai $DB_NAME | gzip > $BACKUP_DIR/db-$DATE.sql.gz

# Keep only last 7 days
find $BACKUP_DIR -name "db-*.sql.gz" -mtime +7 -delete

echo "Backup completed: db-$DATE.sql.gz"
```

Make executable and schedule:

```bash
sudo chmod +x /usr/local/bin/jityai-backup.sh

# Add to crontab (daily at 2 AM)
sudo crontab -e
# Add line:
# 0 2 * * * /usr/local/bin/jityai-backup.sh >> /var/log/jityai-backup.log 2>&1
```

---

## 🔐 SECURITY HARDENING

### Firewall Configuration

```bash
# Install UFW
sudo apt install -y ufw

# Default policies
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow SSH (change port if needed)
sudo ufw allow 22/tcp

# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

### Fail2Ban (Brute Force Protection)

```bash
# Install
sudo apt install -y fail2ban

# Configure for nginx
sudo nano /etc/fail2ban/jail.local
```

Add:

```ini
[nginx-http-auth]
enabled = true
port = http,https
logpath = /var/log/nginx/error.log

[nginx-limit-req]
enabled = true
port = http,https
logpath = /var/log/nginx/error.log
```

```bash
# Restart
sudo systemctl restart fail2ban
```

---

## 📊 MONITORING \u0026 LOGGING

### Application Logs

```bash
# View PM2 logs
pm2 logs jityai

# View error logs only
pm2 logs jityai --err

# Clear logs
pm2 flush
```

### Nginx Logs

```bash
# Access logs
sudo tail -f /var/log/nginx/access.log

# Error logs
sudo tail -f /var/log/nginx/error.log
```

### Database Logs

```bash
# PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-14-main.log
```

---

## ✅ POST-DEPLOYMENT VERIFICATION

- [  ] Application accessible via HTTPS at `https://app.jityai.com`
- [  ] Login page loads (`/login.html`)
- [  ] Admin login works
- [  ] Health check endpoint returns 200: `curl https://app.jityai.com/health`
- [  ] PM2 shows processes running: `pm2 status`
- [  ] Database connection working
- [  ] SSL certificate valid (check browser)
- [  ] File uploads working (test with sample CSV)
- [  ] API key authentication working (test connector)
- [  ] Logs writing successfully
- [  ] Backups running (check `/home/jityai/backups`)

---

## 🆘 TROUBLESHOOTING

### Application won't start
```bash
pm2 logs jityai --err
# Check database connection in .env
```

### 502 Bad Gateway
```bash
sudo systemctl status nginx
pm2 status
# Ensure PM2 app is running on port 3000
```

### Database connection error
```bash
psql -U jityai -d ai_store_manager
# Verify credentials in .env
```

### API key not working
```bash
# Regenerate key
node ~/jityai-app/scripts/generate-api-key.js STORE_001
```

---

## 📞 SUPPORT CONTACTS

- **Database Issues:** Check logs at `/var/log/postgresql/`
- **Application Issues:** `pm2 logs jityai`
- **Nginx Issues:** `sudo nginx -t`

---

## 🏗️ INFRASTRUCTURE PHILOSOPHY (What you do NOT need)
To keep JityAI performant and cost-effective, we purposely avoid the following complexities until strictly necessary (>50 stores):
- **Docker/K8s:** Adds overhead without benefits for single-VM isolation.
- **Load Balancers:** Single Nginx instance handles current traffic easily.
- **Supabase/Managed DB:** Local Postgres is faster and gives better ownership.
- **Redis/Managed Queues:** Memory-based processing is sufficient for <10k SKUs.
- **CloudWatch/Datadog:** PM2 logs and local health checks are more than enough.

---

**Document Version:** 2.1  
**Last Updated:** 2026-02-04
