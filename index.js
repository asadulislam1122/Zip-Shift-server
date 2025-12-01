const express = require("express");
const cors = require("cors");
require("dotenv").config();
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 3000;
//
const crypto = require("crypto");
// fairbase admin key
const admin = require("firebase-admin");

const serviceAccount = require("./zip-shift-admin-key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
//

function generateTrackingId() {
  const prefix = "PRCL";
  const date = new Date().toISOString().split("T")[0].replace(/-/g, "");

  const random = crypto.randomBytes(3).toString("hex").toUpperCase(); // 6 hex chars

  return `${prefix}-${date}-${random}`;
}
// maddileWare
app.use(express.json());
app.use(cors());

const verifyFBToken = async (req, res, next) => {
  // console.log("headers in the middileWare", req.headers.authorization);
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  try {
    const idToken = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    // console.log("decoded in the token", decoded);
    req.decoded_email = decoded.email;
    next();
  } catch (error) {
    return res.status(401).send({ message: "unauthorized access" });
  }
};
//payment Method
const stripe = require("stripe")(process.env.PAYMENT);

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
    const userCollection = db.collection("users");
    const riderCollection = db.collection("riders");
    const parcelCollection = db.collection("parcels");
    const paymentCollection = db.collection("payments");
    // middele more with database access
    const verifayAdmin = async (req, res, next) => {
      const email = req.decoded_email;
      const query = { email };
      const user = await userCollection.findOne(query);
      if (!user || user.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };
    // riders related api
    app.post("/riders", async (req, res) => {
      const rider = req.body;
      rider.status = "pending";
      rider.createdAt = new Date();
      const result = await riderCollection.insertOne(rider);
      res.send(result);
    });
    // get
    app.get("/riders", async (req, res) => {
      const { status, districts, workStatus } = req.query;
      const query = {};
      if (status) {
        query.status = status;
      }
      if (districts) {
        query.districts = districts;
      }
      if (workStatus) {
        query.workStatus = workStatus;
      }
      const cursor = riderCollection.find(query).sort({ createdAt: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });
    // rider accept and approvel
    app.patch("/riders/:id", verifyFBToken, verifayAdmin, async (req, res) => {
      const status = req.body.status;
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          status: status,
          // workStatus: "available",
        },
      };
      // শুধুমাত্র APPROVED হলে workStatus যুক্ত হবে
      if (status === "approved") {
        updatedDoc.$set.workStatus = "available";
      } else {
        updatedDoc.$set.workStatus = "none"; // আপনি চাইলে null/blocked/string কিছু দিতে পারেন
      }
      const result = await riderCollection.updateOne(query, updatedDoc);
      if (status === "approved") {
        const email = req.body.email;
        const userQuery = { email };
        const updateUser = {
          $set: {
            role: "rider",
          },
        };
        const userResult = await userCollection.updateOne(
          userQuery,
          updateUser
        );
      }
      res.send(result);
    });
    // user related api
    app.get("/users", verifyFBToken, async (req, res) => {
      const searchText = req.query.searchText;
      const query = {};
      if (searchText) {
        // query.displayName = { $regex: searchText, $options: "i" };
        query.$or = [
          { displayName: { $regex: searchText, $options: "i" } },
          { email: { $regex: searchText, $options: "i" } },
        ];
      }
      const cursor = userCollection
        .find(query)
        .limit(10)
        .sort({ createAt: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });
    //patch
    app.patch(
      "/users/:id/role",
      verifyFBToken,
      verifayAdmin,
      async (req, res) => {
        const id = req.params.id;
        const roleInfo = req.body;
        const query = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            role: roleInfo.role,
          },
        };
        const result = await userCollection.updateOne(query, updatedDoc);
        res.send(result);
      }
    );
    //
    app.get("/users/:id", async (req, res) => {});
    //
    app.get("/users/:email/role", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await userCollection.findOne(query);
      res.send({ role: user?.role || "user" });
    });

    //
    app.post("/users", async (req, res) => {
      const user = req.body;
      user.role = "user";
      user.createAt = new Date();
      const email = user.email;
      const userExits = await userCollection.findOne({ email });
      if (userExits) {
        return res.send({ message: "user exits" });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });
    //

    // parcel api
    app.get("/parcels", async (req, res) => {
      const query = {};
      const { email, deliveryStatus } = req.query;
      if (email) {
        query.senderEmail = email;
      }
      if (deliveryStatus) {
        query.deliveryStatus = deliveryStatus;
      }
      const options = { sort: { createAt: -1 } };
      const cursor = parcelCollection.find(query, options);
      const result = await cursor.toArray();
      res.send(result);
    });
    //
    app.get("/paecels/riders", async (req, res) => {
      const { riderEmail, deliveryStatus } = req.query;
      const query = {};
      if (riderEmail) {
        query.riderEmail = riderEmail;
      }
      if (deliveryStatus) {
        query.deliveryStatus = { $in: ["driver_assigned", "rider_arriving"] };
      }
      const cursor = parcelCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });
    // get api akta id ar jonno ********************
    app.get("/parcels/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await parcelCollection.findOne(query);
      res.send(result);
    });
    // post api
    app.post("/parcels", async (req, res) => {
      const parcel = req.body;
      parcel.createAt = new Date();
      const result = await parcelCollection.insertOne(parcel);
      res.send(result);
    });
    // delete api
    app.delete("/parcels/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await parcelCollection.deleteOne(query);
      res.send(result);
    });
    //
    //
    //
    // parcel patch
    app.patch("/parcels/:id", async (req, res) => {
      const { riderName, riderEmail, riderId } = req.body;
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          deliveryStatus: "driver_assigned",
          riderId: riderId,
          riderName: riderName,
          riderEmail: riderEmail,
        },
      };
      const result = await parcelCollection.updateOne(query, updatedDoc);

      // update rider infrmation
      const riderQuery = { _id: new ObjectId(riderId) };
      const riderUpdateDocs = {
        $set: {
          workStatus: "in_delivery ✔",
        },
      };
      const riderResult = await riderCollection.updateOne(
        riderQuery,
        riderUpdateDocs
      );
      res.send(riderResult);
    });

    // assignDelivary
    app.patch("/parcels/:id/status", async (req, res) => {
      const { deliveryStatus } = req.body;
      const query = {
        _id: new ObjectId(req.params.id),
      };
      const updatedDoc = {
        $set: {
          deliveryStatus: deliveryStatus,
        },
      };
      const result = await parcelCollection.updateOne(query, updatedDoc);
      res.send(result);
    });
    // payment Related api
    app.post("/create-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      const amount = parseInt(paymentInfo.cost) * 100;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "USD",
              unit_amount: amount,
              product_data: {
                name: paymentInfo.parcelName,
              },
            },
            quantity: 1,
          },
        ],
        customer_email: paymentInfo.senderEmail,
        mode: "payment",
        metadata: {
          parcelId: paymentInfo.parcelId,
          parcelName: paymentInfo.parcelName,
        },
        success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
      });
      // console.log(session);
      res.send({ url: session.url });
    });
    //payment Success
    app.patch("/payment-success", async (req, res) => {
      const sessionId = req.query.session_id;
      // console.log("session id", sessionId);
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      // console.log("session retrieve", session);
      const transactionId = session.payment_intent;
      const query = { transactionId: transactionId };
      const paymentExist = await paymentCollection.findOne(query);
      // console.log(paymentExist);
      if (paymentExist) {
        return res.send({
          message: "already exists",
          transactionId,
          trackingId: paymentExist.trackingId,
        });
      }
      //
      const trackingId = generateTrackingId();
      //
      if (session.payment_status === "paid") {
        const id = session.metadata.parcelId;
        const query = { _id: new ObjectId(id) };
        const update = {
          $set: {
            paymentStatus: "paid",
            deliveryStatus: "pending-pickup",
            trackingId: trackingId,
          },
        };
        const result = await parcelCollection.updateOne(query, update);
        const payment = {
          amount: session.amount_total / 100,
          currency: session.currency,
          customerEmail: session.customer_email,
          parcelId: session.metadata.parcelId,
          parcelName: session.metadata.parcelName,
          transactionId: session.payment_intent,
          paymentStatus: session.payment_status,
          paidAt: new Date(),
          trackingId: trackingId,
        };
        if (session.payment_status === "paid") {
          const resultPayment = await paymentCollection.insertOne(payment);
          // return
          res.send({
            success: true,
            modifyParcel: result,
            trackingId: trackingId,
            transactionId: session.payment_intent,
            paymentInfo: resultPayment,
          });
        }
        // res.send(result);
      }
      // return
      res.send({ success: false });
    });
    // payment related api
    app.get("/payments", verifyFBToken, async (req, res) => {
      const email = req.query.email;
      const query = {};
      // console.log(req.headers);
      if (email) {
        query.customerEmail = email;
        // check email adress
        if (email !== req.decoded_email) {
          return res.status(403).send({ message: "forbidden access" });
        }
      }
      const cursor = paymentCollection.find(query).sort({ paidAt: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });
    //
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
