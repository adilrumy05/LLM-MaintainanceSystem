const fs = require('fs').promises;
const path = require('path');

// ==========================================
// ⚙️ CONFIGURATION - UPDATE THIS PATH
// ==========================================
// Replace this with the actual path to the root folder in your G:\ drive
const INPUT_ROOT = 'G:\\.shortcut-targets-by-id\\1Q3zi9DBebwaJWFHjcdvGrNeV9UygRZZY\\RAG_OCRv1\\output'; 
const OUTPUT_ROOT = path.join(__dirname, 'output');
const CHECKPOINT_FILE = path.join(__dirname, 'copy_checkpoint.json');

// ==========================================

async function loadCheckpoint() {
    try {
        const data = await fs.readFile(CHECKPOINT_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return {}; // Return an empty object if no checkpoint file exists yet
    }
}

async function saveCheckpoint(checkpoint) {
    await fs.writeFile(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
}

async function runMigration() {
    console.log('🚀 Starting non-destructive image migration...');
    const checkpoint = await loadCheckpoint();

    try {
        // LEVEL 1: Classifications (e.g., MANUAL)
        const classifications = await fs.readdir(INPUT_ROOT, { withFileTypes: true });
        
        for (const cls of classifications) {
            if (!cls.isDirectory()) continue;
            const clsPath = path.join(INPUT_ROOT, cls.name);

            // LEVEL 2: Document Groups (e.g., panasonic_aircon_CS-S10TKH)
            const docGroups = await fs.readdir(clsPath, { withFileTypes: true });
            for (const docGroup of docGroups) {
                if (!docGroup.isDirectory()) continue;
                const docGroupPath = path.join(clsPath, docGroup.name);

                // LEVEL 3: Filenames (e.g., CS-s10-13-18-24-28tkh)
                const filenames = await fs.readdir(docGroupPath, { withFileTypes: true });
                for (const filename of filenames) {
                    if (!filename.isDirectory()) continue;
                    const filenamePath = path.join(docGroupPath, filename.name);

                    // LEVEL 4: Pages (e.g., page_4)
                    const pages = await fs.readdir(filenamePath, { withFileTypes: true });
                    for (const page of pages) {
                        if (!page.isDirectory()) continue;
                        
                        // Create a unique key for the checkpoint
                        const pageKey = `${cls.name}/${docGroup.name}/${filename.name}/${page.name}`;
                        
                        // 🔁 Resumability: Skip if already processed
                        if (checkpoint[pageKey]) {
                            console.log(`⏭️ Skipped (Already Processed): ${pageKey}`);
                            continue;
                        }

                        console.log(`⚙️ Processing: ${pageKey}`);
                        
                        // Define source paths
                        const pageDirPath = path.join(filenamePath, page.name);
                        const sourcePagePng = path.join(pageDirPath, 'page.png');
                        const sourceImagesDir = path.join(pageDirPath, 'images');

                        // Define destination paths
                        // output/{classification}/{document_group_id}/{filename}/{page_num}/images/
                        const destImagesDir = path.join(OUTPUT_ROOT, cls.name, docGroup.name, filename.name, page.name, 'images');
                        const destPagePng = path.join(destImagesDir, 'page.png');

                        // Ensure destination directory exists
                        await fs.mkdir(destImagesDir, { recursive: true });

                        // 🖼️ 1. Copy page.png into the new images folder
                        try {
                            await fs.copyFile(sourcePagePng, destPagePng);
                        } catch (err) {
                            if (err.code === 'ENOENT') {
                                console.warn(`   ⚠️ Warning: No page.png found in ${pageKey}`);
                            } else {
                                throw err;
                            }
                        }

                        // 🖼️ 2. Copy contents of the original images/ folder (if it exists)
                        try {
                            const subImages = await fs.readdir(sourceImagesDir, { withFileTypes: true });
                            for (const subImage of subImages) {
                                if (subImage.isFile()) {
                                    const srcImgPath = path.join(sourceImagesDir, subImage.name);
                                    const destImgPath = path.join(destImagesDir, subImage.name);
                                    await fs.copyFile(srcImgPath, destImgPath);
                                }
                            }
                        } catch (err) {
                            // It's fine if the images folder is missing/empty, just ignore ENOENT
                            if (err.code !== 'ENOENT') throw err; 
                        }

                        // 📌 Checkpoint System: Mark as complete and save
                        checkpoint[pageKey] = true;
                        await saveCheckpoint(checkpoint);
                        console.log(`   ✅ Success: ${pageKey}`);
                    }
                }
            }
        }
        console.log('\n🎉 Migration Complete!');

    } catch (error) {
        console.error('\n❌ Fatal Error during migration:', error);
        console.log('Don\'t worry! The checkpoint was saved. Just fix the error and run the script again.');
    }
}

runMigration();