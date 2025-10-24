// reset_llm_correctness_data.js
// WARNING: Destructive. Deletes all answers and unsets finalReport on sessions.
const { MongoClient } = require('mongodb');

const ATLAS_URI = "mongodb+srv://anirudhkulkarni2382004:RK3vV18CD82zDLsK@cluster0.i3arv.mongodb.net/ai_interviewer?retryWrites=true&w=majority&appName=Cluster0";
const DB_NAME = "ai_interviewer";

(async () => {
  const client = new MongoClient(ATLAS_URI);
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const answers = db.collection('answers');
    const sessions = db.collection('sessions');

    const del = await answers.deleteMany({});
    const upd = await sessions.updateMany({}, { $unset: { finalReport: "" } });

    console.log({ deleted_answers: del.deletedCount, sessions_finalReport_unset: upd.modifiedCount });
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await client.close();
  }
})();