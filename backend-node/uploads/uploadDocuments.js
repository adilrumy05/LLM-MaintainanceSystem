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
// Single canonical location: the repository root. See uploadToFirebase.js.
const serviceAccount = require('../serviceAccountKey.json');
const app = getApps().length ? getApps()[0] : initializeApp({
  credential: cert(serviceAccount),
  storageBucket: "rbacfyp.firebasestorage.app" 
});

const bucket = getStorage(app).bucket();
const db = getFirestore(app);

// 📂 Points to the 'data' folder in your current directory
const DATA_ROOT = "C:/Users/phill/Downloads/data"; 
const CHECKPOINT_FILE = path.join(__dirname, 'upload_checkpoint_docs.json'); 
// ==========================================

// 📌 Checkpoint Helper Functions
async function loadCheckpoint() {
    try {
        const data = await fs.readFile(CHECKPOINT_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return {}; // Return empty object if no checkpoint exists
    }
}

async function saveCheckpoint(checkpoint) {
    await fs.writeFile(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
}

// Directory Walker (Finds every file inside 'data' and its subfolders)
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

async function uploadAndIndexDocuments() {
    console.log("🚀 Starting Resumable Document Upload...");
    const checkpoint = await loadCheckpoint();
    let uploadCount = 0;
    let skipCount = 0;

    try {
        for await (const filePath of walk(DATA_ROOT)) {
            // 1. Calculate the Firebase paths
            const relativePath = path.relative(DATA_ROOT, filePath);
            
            // Prepend 'data/' to match your required structure
            const firebasePath = 'data/' + relativePath.split(path.sep).join('/'); 
            
            // 🔁 Resumability: Skip if already done
            if (checkpoint[firebasePath]) {
                console.log(`⏭️ Skipped: ${firebasePath}`);
                skipCount++;
                continue;
            }

            // 2. Extract Metadata for Firestore
            const pathParts = firebasePath.split('/');
            let documentGroup = "UNKNOWN";
            let actualFileName = path.basename(firebasePath);

            // Logic to handle the CSV in the root vs PDFs in subfolders
            if (pathParts.length === 2) {
                // It's the data_information.csv in the root folder
                documentGroup = "ROOT_FILE"; 
            } else if (pathParts.length >= 3) {
                // It's a PDF inside a specific aircon folder
                documentGroup = pathParts[1]; 
            }

            console.log(`☁️ Uploading: ${firebasePath}`);

            // 3. Upload to Firebase Storage
            await bucket.upload(filePath, {
                destination: firebasePath,
                metadata: { cacheControl: 'public, max-age=31536000' }
            });

            // 4. Generate the Public URL
            const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(firebasePath)}?alt=media`;

            // 5. Save the index to Firestore
            const docRef = db.collection('ManualDocuments').doc();
            await docRef.set({
                documentGroup: documentGroup,
                fileName: actualFileName,
                storagePath: firebasePath,
                documentUrl: publicUrl,
                uploadedAt: FieldValue.serverTimestamp()
            });

            // 6. Save checkpoint after success
            checkpoint[firebasePath] = true;
            await saveCheckpoint(checkpoint);
            
            uploadCount++;
        }
        
        console.log(`\n🎉 Document Upload Complete!`);
        console.log(`📊 Uploaded: ${uploadCount} new files.`);
        console.log(`⏭️ Skipped: ${skipCount} files.`);
        
    } catch (error) {
        console.error("\n❌ Error during upload:", error);
        console.log("Your progress is saved in upload_checkpoint_docs.json. Run again to resume.");
    }
}

uploadAndIndexDocuments();