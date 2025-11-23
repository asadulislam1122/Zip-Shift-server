const express = require("express");
const cors = require("cors");
require("dotenv").config();
const app = express();
const { MongoClient, ServerApiVersion } = require("mongodb");
const port = process.env.PORT || 3000;
// maddileWare
app.use(express.json());
app.use(cors());
//

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster-first-server-ap.bcgcgzv.mongodb.net/?appName=Cluster-first-server-app`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    //
    const db = client.db("zap_shift_db");
    const parcelCollection = db.collection("parcels");
    // parcel api
    app.get("/parcels", async (req, res) => {});
    app.post("/parcels", async (req, res) => {
      const parcel = req.body;
      const result = await parcelCollection.insertOne(parcel);
      res.send(result);
    });
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged Zap_Shift-USer your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

//
app.get("/", (req, res) => {
  res.send("Hello Zap is Sipting Shipting ");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
