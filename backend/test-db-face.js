const db = require("./database");

async function testDatabase() {
  console.log("Starting SQLite database CRUD test...");
  
  try {
    // 1. Clear any existing records from prior tests
    await db.run("DELETE FROM detected_faces WHERE id LIKE 'test_%'");
    console.log("Cleaned up old test database records.");

    // 2. Insert a new face
    const testFaceId = "test_face_123";
    const testSignature = "Oval face, dark brown hair, high eyebrows, thick frame glasses";
    const testS3Url = "https://visionvault-ai-images.s3.eu-north-1.amazonaws.com/visionvault/test.jpg";
    
    console.log(`Inserting test face: ${testFaceId}...`);
    await db.run(
      `INSERT INTO detected_faces (id, face_signature, upload_count, s3_url) 
       VALUES (?, ?, 1, ?)`,
      [testFaceId, testSignature, testS3Url]
    );
    console.log("Successfully inserted face record!");

    // 3. Verify insertion
    let row = await db.get("SELECT * FROM detected_faces WHERE id = ?", [testFaceId]);
    console.log("Retrieved record:", row);
    
    if (row && row.upload_count === 1) {
      console.log("✅ Insertion and count checks passed!");
    } else {
      throw new Error("Count checks failed after insertion.");
    }

    // 4. Update the upload count (simulate duplicate face detection)
    console.log(`Simulating duplicate upload of face: ${testFaceId}...`);
    await db.run(
      `UPDATE detected_faces 
       SET upload_count = upload_count + 1, last_seen = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [testFaceId]
    );

    // 5. Verify update
    row = await db.get("SELECT * FROM detected_faces WHERE id = ?", [testFaceId]);
    console.log("Retrieved updated record:", row);
    
    if (row && row.upload_count === 2) {
      console.log("✅ Count increment verification passed!");
    } else {
      throw new Error("Count checks failed after update.");
    }

    // 6. Fetch all faces
    const allFaces = await db.all("SELECT * FROM detected_faces");
    console.log("All records in database:", allFaces);

    console.log("\n🎉 ALL DATABASE TEST CASES PASSED SUCCESSFULLY!");
  } catch (error) {
    console.error("\n❌ DATABASE TEST CASE FAILED!");
    console.error(error.message);
  } finally {
    // Close connection
    await db.close();
    console.log("Database connection closed.");
  }
}

testDatabase();
