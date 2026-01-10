import webpush from 'web-push'

// Generate VAPID keys for web push notifications
// Run this once: bun run scripts/generateVapidKeys.ts
// Then add the output to your .env file

const vapidKeys = webpush.generateVAPIDKeys()

console.log('Add these to your .env file:\n')
console.log(`VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`)
console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`)
console.log(`VAPID_SUBJECT=mailto:your-email@example.com`)
console.log('\nNote: Replace your-email@example.com with a real email address.')
