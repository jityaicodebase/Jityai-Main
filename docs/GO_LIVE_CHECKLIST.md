# JityAI Production Go-Live Checklist
**Version:** 2.0  
**Deployment Date:** ____________

---

## PRE-LAUNCH (1 Week Before)

### Infrastructure
- [ ] VM provisioned and accessible
- [ ] Domain DNS configured and propagating
- [ ] SSL certificate obtained and tested
- [ ] Firewall rules configured
- [ ] Backup system tested and verified

### Database
- [ ] Fresh database created on production server
- [ ] Schema applied successfully (`schema.sql`)
- [ ] ALL auth tables created (users, api_keys, operational_audit_log, store_settings)
- [ ] Database user permissions verified
- [ ] Test connection from application server
- [ ] Backup script tested manually

### Application
- [ ] Code deployed to production server
- [ ] `.env` file configured with production values
- [ ] JWT_SECRET generated (256-bit random)
- [ ] All npm packages installed
- [ ] PM2 ecosystem configured
- [ ] Application starts without errors
- [ ] Health endpoint returns 200

### Nginx
- [ ] Configuration file created
- [ ] Syntax validated (`nginx -t`)
- [ ] HTTPS redirect working
- [ ] SSL certificate valid in browser
- [ ] File upload size limit set (50MB)
- [ ] Proxy headers configured

---

## SECURITY HARDENING

- [ ] Firewall enabled (UFW)
- [ ] Only ports 22, 80, 443 open
- [ ] Fail2Ban configured
- [ ] SSH key-based authentication (disable password auth)
- [ ] Database only accepts local connections
- [ ] `.env` file permissions: `chmod 600`
- [ ] Application runs as non-root user (`jityai`)

---

## USER ACCOUNT SETUP

### Admin Account
- [ ] Admin user created (`admin@jityai.com`)
- [ ] Admin password set to strong password
- [ ] Admin login tested
- [ ] Password reset script tested

### Store Accounts (For Each Store)
- [ ] User account created
- [ ] Email format: `<store_id>@store.local`
- [ ] Default password set: `password123`
- [ ] Store settings record created
- [ ] Login tested for each store

### API Keys (For Each Store)
- [ ] API key generated using script
- [ ] Key saved securely (password manager)
- [ ] Key expiry date documented
- [ ] Test API key authentication

---

## CONNECTOR SETUP (Store-Side)

For EACH physical store:

- [ ] Connector script deployed to store computer
- [ ] `.env` configured with:
  - [ ] JITYAI_API_URL
  - [ ] JITYAI_API_KEY
  - [ ] JITYAI_STORE_ID
  - [ ] WATCH_FOLDER path
- [ ] Watch folder created
- [ ] Processed/Failed folders created
- [ ] Test file upload successful
- [ ] Connector set to run on startup
- [ ] Error handling tested (network failure, bad CSV)

---

## FUNCTIONAL TESTING

### Authentication
- [ ] Login page accessible
- [ ] Valid credentials allow login
- [ ] Invalid credentials rejected
- [ ] Account lockout after 5 failed attempts (15 min)
- [ ] JWT token expires after 24 hours
- [ ] Logout clears session
- [ ] Auto-redirect to login when token expires

### Store Isolation
- [ ] User A cannot access User B's data
- [ ] API rejects requests with store_id mismatch
- [ ] Dashboard only shows user's own store

### File Upload (Manual)
- [ ] CSV upload works
- [ ] XLSX upload works
- [ ] Large files (up to 10,000 rows) process successfully
- [ ] Invalid files rejected with clear error
- [ ] Processed files archived
- [ ] Batch ID generated

### File Sync (Connector)
- [ ] Connector detects new files
- [ ] Files uploaded successfully
- [ ] Retry logic works on network failure
- [ ] Processed files moved correctly
- [ ] Failed files moved to failed folder

### AI Analysis
- [ ] Inventory AI agent runs successfully
- [ ] Recommendations generated
- [ ] LLM reasoning appears (top products)
- [ ] Deterministic math correct (all products)
- [ ] Risk states calculated (SAFE, WATCH, RISK, CRITICAL)

### Dashboard
- [ ] Store stats load correctly
- [ ] Inventory list displays
- [ ] Recommendations tab works
- [ ] Filters functional
- [ ] Barcode scan input works

### Audit Logging
- [ ] Login events logged
- [ ] File uploads logged
- [ ] Sync events logged
- [ ] AI runs logged
- [ ] Failed attempts logged

---

## PERFORMANCE TESTING

- [ ] Dashboard loads in \u003c 2 seconds
- [ ] 10,000 row CSV processes in \u003c 60 seconds
- [ ] AI analysis completes in \u003c 5 minutes
- [ ] Concurrent logins work (5+ users)
- [ ] Database queries indexed and fast

---

## MONITORING \u0026 ALERTING

- [ ] PM2 monitoring active
- [ ] Application logs visible (`pm2 logs`)
- [ ] Nginx logs accessible
- [ ] Database logs accessible
- [ ] Disk space monitored
- [ ] CPU/RAM usage normal (\< 70%)

---

## BACKUP \u0026 DISASTER RECOVERY

- [ ] Daily backup script configured
- [ ] Backup runs successfully
- [ ] Backup retention: 7 days
- [ ] Test restore from backup
- [ ] Offsite backup (optional but recommended)

---

## DOCUMENTATION

- [ ] Deployment guide complete
- [ ] Admin password documented (secure storage)
- [ ] API keys documented (secure storage)
- [ ] Store credentials sent to owners
- [ ] Troubleshooting guide available
- [ ] Support contact information shared

---

## TRAINING \u0026 ROLLOUT

### Store Owners
- [ ] Training session completed
- [ ] Login demo
- [ ] Dashboard walkthrough
- [ ] How to interpret AI recommendations
- [ ] How to upload files (manual fallback)
- [ ] Support contact provided

### Store Staff
- [ ] Connector installation guide provided
- [ ] How to check sync status
- [ ] What to do if sync fails
- [ ] Emergency contact

---

## GO-LIVE SIGN-OFF

### Technical Lead
- [ ] All technical checks passed
- [ ] Signature: ________________  Date: ________

### Security Review
- [ ] Security hardening verified
- [ ] Signature: ________________  Date: ________

### Operations Lead
- [ ] Monitoring confirmed
- [ ] Backups verified
- [ ] Signature: ________________  Date: ________

### Project Manager
- [ ] User acceptance complete
- [ ] Training delivered
- [ ] Launch approved
- [ ] Signature: ________________  Date: ________

---

## POST-LAUNCH (Week 1)

- [ ] Daily health checks
- [ ] Monitor error logs
- [ ] User feedback collected
- [ ] Performance metrics tracked
- [ ] Backup verification
- [ ] No critical issues reported

---

## ROLLBACK PLAN

If critical issues arise:

1. **Immediate:**
   - [ ] Stop PM2: `pm2 stop jityai`
   - [ ] Notify all users
   - [ ] Document issue

2. **Within 1 Hour:**
   - [ ] Restore previous database backup
   - [ ] Revert code to previous version
   - [ ] Restart application

3. **Communication:**
   - [ ] Notify stakeholders
   - [ ] Estimated time to resolution
   - [ ] Post-mortem scheduled

---

**Checklist Version:** 2.0  
**Last Updated:** 2026-02-04  
**Completed By:** __________________  
**Launch Date:** __________________  
**Launch Time:** __________________
