// firebase-admin v13+ dropped the namespaced API (admin.credential / admin.firestore).
// See server/config/firebaseAdmin.js for the full explanation.
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const fs = require('fs').promises;
const path = require('path');

// ==========================================
// ⚙️ CONFIGURATION
// ==========================================
// Single canonical location: the repository root. This used to read
// ./serviceAccountKey.json, which meant keeping a second copy of a private key
// inside uploads/ — more copies of a secret means more chances one is committed
// by accident, and two copies drift when the key is rotated.
const serviceAccount = require('../serviceAccountKey.json');
const app = getApps().length ? getApps()[0] : initializeApp({
  credential: cert(serviceAccount),
  storageBucket: "rbacfyp.firebasestorage.app" // ✅ Updated to your exact bucket
});

const bucket = getStorage(app).bucket();
const db = getFirestore(app);
const OUTPUT_ROOT = path.join(__dirname, 'output');
const CHECKPOINT_FILE = path.join(__dirname, 'upload_checkpoint.json'); 
// ==========================================

// 📌 Checkpoint Helper Functions
async function loadCheckpoint() {
    try {
        const data = await fs.readFile(CHECKPOINT_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return {}; // Return empty object if no checkpoint exists yet
    }
}

async function saveCheckpoint(checkpoint) {
    await fs.writeFile(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
}

// Directory Walker
async function *walk(dir) {
    const files = await fs.readdir(dir, { withFileTypes: true });
    for (const file of files) {
        const res = path.join(dir, file.name);
        if (file.isDirectory()) {
            yield* walk(res);
        } else {
            yield res;
        }
    }
}

async function uploadAndIndex() {
    console.log("🚀 Starting Resumable Firebase Upload & Indexing...");
    const checkpoint = await loadCheckpoint();
    let uploadCount = 0;
    let skipCount = 0;

    try {
        for await (const filePath of walk(OUTPUT_ROOT)) {
            // 1. Calculate the Firebase paths
            const relativePath = path.relative(OUTPUT_ROOT, filePath);
            
            // ✨ FIX: Prepend 'output/' to match your teammate's exact requirement
            const firebasePath = 'output/' + relativePath.split(path.sep).join('/'); 
            
            // 🔁 Resumability: Skip if already uploaded and indexed
            if (checkpoint[firebasePath]) {
                console.log(`⏭️ Skipped (Already Uploaded): ${firebasePath}`);
                skipCount++;
                continue;
            }

            // Extract metadata from the path for the database index
            const pathParts = firebasePath.split('/');
            const classification = pathParts[1] || "UNKNOWN";
            const documentGroup = pathParts[2] || "UNKNOWN";
            const filename = pathParts[3] || "UNKNOWN";
            const pageNum = pathParts[4] || "UNKNOWN";
            
            // Using path.basename is a safer way to grab the exact file name (e.g., page.png)
            const actualFileName = path.basename(firebasePath); 

            console.log(`☁️ Uploading: ${firebasePath}`);

            // 2. Upload to Firebase Storage
            await bucket.upload(filePath, {
                destination: firebasePath,
                metadata: { cacheControl: 'public, max-age=31536000' }
            });

            // 3. Generate the Public URL
            const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(firebasePath)}?alt=media`;

            // 4. Save to Firestore
            const docRef = db.collection('ManualImages').doc();
            await docRef.set({
                classification,
                documentGroup,
                filename,
                pageNum,
                imageName: actualFileName,
                storagePath: firebasePath,
                imageUrl: publicUrl,
                uploadedAt: FieldValue.serverTimestamp()
            });

            // 📌 Save progress ONLY after both Storage and Firestore succeed
            checkpoint[firebasePath] = true;
            await saveCheckpoint(checkpoint);
            
            uploadCount++;
        }
        
        console.log(`\n🎉 Success!`);
        console.log(`📊 Uploaded: ${uploadCount} new images.`);
        console.log(`⏭️ Skipped: ${skipCount} previously uploaded images.`);
        
    } catch (error) {
        console.error("\n❌ Error during upload:", error);
        console.log("Don't worry! Your progress was saved. Just run the script again.");
    }
}

uploadAndIndex();