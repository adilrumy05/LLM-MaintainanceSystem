const crypto = require('crypto');
const fs = require('fs');

/**
 * Generates a SHA-256 hash for a specific file.
 */
function generateFileHash(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

/**
 * Compares the current file against a "Known Good" hash.
 */
function verifyManualIntegrity(filePath, knownGoodHash) {
  try {
    const currentHash = generateFileHash(filePath);
    
    if (currentHash === knownGoodHash) {
      console.log("INTEGRITY VERIFIED: Manual is authentic.");
      return true;
    } else {
      console.error("INTEGRITY BREACH: Manual has been modified!");
      console.log(`   -> Expected: ${knownGoodHash}`);
      console.log(`   -> Actual:   ${currentHash}`);
      return false;
    }
  } catch (error) {
    console.error("Error accessing manual file:", error.message);
    return false;
  }
}

// ==========================================
// TEST
// ==========================================

const ORIGINAL_FILE = './test_manual.pdf';
const TAMPERED_FILE = './test_manual_modified.pdf';

console.log("--- Starting Realistic Integrity Test ---\n");

try {
    // Generate the "Known Good" hash from the original file
    const officialHash = generateFileHash(ORIGINAL_FILE);
    console.log(`[Baseline] Official FedEx Hash: \n${officialHash}\n`);

    // Test a SUCCESS scenario (Using the original file)
    console.log("[Test 1] Verifying the original, untampered file...");
    verifyManualIntegrity(ORIGINAL_FILE, officialHash);

    // Test a FAIL scenario (Using your newly modified file)
    console.log("\n[Test 2] Verifying the subtly modified file...");
    verifyManualIntegrity(TAMPERED_FILE, officialHash);

} catch (error) {
    console.error("Test failed to run. Ensure both 'test_manual.pdf' and 'test_manual_modified.pdf' are in this folder.");
}