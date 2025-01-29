const express = require("express");
const app = express();
require("dotenv").config();
const cors = require("cors");
const jwt = require("jsonwebtoken");
const port = process.env.PORT || 5000;

app.use(express.json());
app.use(cors());

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);




const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.mycom.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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
    // await client.connect();





    const usersCollection = client.db("picciWorkers").collection("users");
    const tasksCollection = client.db("picciWorkers").collection("tasks");
    const paymentCollection = client.db("picciWorkers").collection("payments");
    const notificationsCollection = client
      .db("picciWorkers")
      .collection("notifications");
    const withdrawalCollection = client
      .db("picciWorkers")
      .collection("withdraws");
    const submissionsCollection = client
      .db("picciWorkers")
      .collection("submissions");
    app.get("/", (req, res) => {
      res.send("Hello World!");
    });
    async function addNotification(notification) {
      await notificationsCollection.insertOne(notification);
    }
    // jwt token apis
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });
    // middleware
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        res.status(401).send({ message: "unauthorized token" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          res.status(401).send({ message: "unauthorized token" });
        }
        req.decoded = decoded;
        next();
      });
    };
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden token" });
      }
      next();
    };
    app.post("/submission-status", async (req, res) => {
      const { status, buyerName, workerEmail, payableAmount, taskTitle } =
        req.body;
      const message =
        status === "approved"
          ? `You have earned ${payableAmount} from ${buyerName} for completing ${taskTitle}`
          : `Your submission for ${taskTitle} was rejected by ${buyerName}.`;

      const notification = {
        message,
        toEmail: workerEmail,
        actionRoute: "/dashboard/worker-home",
        time: new Date(),
      };

      await addNotification(notification);
      res.status(200).send({ success: true });
    });
    app.post("/withdrawal-status", async (req, res) => {
      const { status, workerEmail } = req.body;

      if (status === "approved") {
        const notification = {
          message: `Your withdrawal request has been approved.`,
          toEmail: workerEmail,
          actionRoute: "/dashboard/worker-home",
          time: new Date(),
        };

        await addNotification(notification);
      }

      res.status(200).send({ success: true });
    });
    app.post("/new-submission", async (req, res) => {
      const { buyerEmail, taskTitle, workerName } = req.body;

      const notification = {
        message: `${workerName} has submitted a new submission for ${taskTitle}.`,
        toEmail: buyerEmail,
        actionRoute: "/dashboard/buyer-home",
        time: new Date(),
      };

      await addNotification(notification);
      res.status(200).send({ success: true });
    });
    app.get("/notifications/:email", async (req, res) => {
      const { email } = req.params;
      const notifications = await notificationsCollection
        .find({ toEmail: email })
        .sort({ time: -1 })
        .toArray();

      res.status(200).json(notifications);
    });
    // user api
    app.post("/user", async (req, res) => {
      const { name, email, imageUrl,firebaseUid, user_role } = req.body;
      if (!email || !imageUrl || !user_role || !name || !firebaseUid) {
        return res.status(400).json({ message: "All field are required" });
      }
      const existingUser = await usersCollection.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
      }
      let coins = 0;
      if (user_role === "worker") {
        coins = 10;
      } else if (user_role === "buyer") {
        coins = 50;
      }

      const result = await usersCollection.insertOne({
        firebaseUid,
        name,
        email,
        imageUrl,
        user_role,
        coins,
      });
      res.send(result);
    });
    app.get("/user/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden token" });
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });
    app.get("/user/buyer/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden token" });
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let buyer = false;
      if (user) {
        buyer = user?.role === "buyer";
      }
      res.send({ buyer });
    });
    app.get("/user/worker/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden token" });
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let worker = false;
      if (user) {
        worker = user?.role === "worker";
      }
      res.send({ worker });
    });
    app.patch("/update-user/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = req.body;
      const updateDoc = {
        $set: {
          name: user.name,
          imageUrl: user.imageUrl,
        },
      };
      console.log(updateDoc, email);
      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result);
    });
    app.get("/user", async (req, res) => {
      const { email } = req.query;
      const result = await usersCollection.findOne({ email });
      res.send(result);
    });
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const result = await usersCollection.findOne({ email });
      res.send(result);
    });
    app.post("/add-tasks", async (req, res) => {
      const tasks = req.body;
      const result = await tasksCollection.insertOne(tasks);
      res.send(result);
    });
    app.get("/home-stats", async (req, res) => {
      const totalTasks = await tasksCollection.estimatedDocumentCount();
      const totalSubmissions =
        await submissionsCollection.estimatedDocumentCount();
      const totalUsers = await usersCollection.estimatedDocumentCount();

      res.send({ totalTasks, totalSubmissions, totalUsers });
    });
    app.get("/all-tasks", async (req, res) => {
      const result = await tasksCollection
        .aggregate([
          {
            $match: {
              required_workers: { $gt: 0 },
            },
          },
        ])
        .toArray();
      res.send(result);
    });
    app.get("/all-available-task", async (req, res) => {
      const result = await tasksCollection
        .aggregate([
          {
            $match: {
              required_workers: { $gt: 0 },
            },
          },
        ])
        .toArray();
      res.send(result);
    });
    app.get("/my-submissions/:email", async (req, res) => {
      const email = req.params.email;
      const page = parseInt(req.query.page);
      const limit = parseInt(req.query.limit);
      const query = { worker_email: email };
      const result = await submissionsCollection
        .find(query)
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray();
      res.send(result);
    });

    app.get("/task/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await tasksCollection.findOne(query);
      res.send(result);
    });
    app.patch("/update-task/:id", async (req, res) => {
      const id = req.params.id;
      const tasks = req.body;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          task_title: tasks.task_title,
          task_detail: tasks.task_detail,
          submission_info: tasks.submission_info,
        },
      };
      const result = await tasksCollection.updateOne(query, updateDoc);
      res.send(result);
    });
    app.post("/payment", async (req, res) => {
      const payment = req.body;
      const result = await paymentCollection.insertOne(payment);
      res.send(result);
    });
    app.get("/payment", async (req, res) => {
      const result = await paymentCollection.find().toArray();
      res.send(result);
    });
    app.get("/task/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await tasksCollection.findOne(query);
      res.send(result);
    });
    app.patch("/users/:email", async (req, res) => {
      const email = req.params.email;
      const { withdrawal_coin } = req.body;
      const updateDoc = { $inc: { coins: -parseInt(withdrawal_coin) } };
      const result = await usersCollection.updateOne({ email }, updateDoc);
      res.send(result);
    });
    app.patch("/users-coins/:email", async (req, res) => {
      const { email } = req.params;
      const { coins } = req.body;
      const updatedUser = await usersCollection.updateOne(
        { email },
        { $inc: { coins: coins } }
      );
      res.send(updatedUser);
    });
    app.post("/update-user-coins", async (req, res) => {
      const { email, coins } = req.body;
      const user = await usersCollection.findOne({ email });
      const updatedCoins = parseInt(user.coins) + parseInt(coins);
      const result = await usersCollection.updateOne(
        { email },
        { $set: { coins: updatedCoins } }
      );
      res.send(result);
    });
    // task delete and refill coins
    app.delete("/tasks/:id", async (req, res) => {
      const { id } = req.params;
      const { email } = req.body;
      const task = await tasksCollection.findOne({ _id: new ObjectId(id) });
      const refillAmount =
        parseInt(task.required_workers) * parseInt(task.payable_amount);
      const deleteResult = await tasksCollection.deleteOne({
        _id: new ObjectId(id),
      });
      const updateResult = await usersCollection.updateOne(
        { email },
        { $inc: { coins: refillAmount } }
      );
      res.send(updateResult);
    });
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      // Create a PaymentIntent with the order amount and currency
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });
    app.get("/pending-submissions/:email", async (req, res) => {
      const email = req.params.email;
      const query = { buyer_email: email, status: "pending" };
      const result = await submissionsCollection.find(query).toArray();
      res.send(result);
    });
    app.patch("/update-submission-status/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const { status } = req.body;
      const updateDoc = {
        $set: { status },
      };
      const result = await submissionsCollection.updateOne(query, updateDoc);
      res.send(result);
    });
    app.patch("/update-user-coins/:email", async (req, res) => {
      const email = req.params.email;
      const { payable_amount } = req.body;
      const updateDoc = {
        $inc: { coins: payable_amount },
      };
      const result = await usersCollection.updateOne({ email }, updateDoc);
      res.send(result);
    });
    app.patch("/update-required-workers/:task_id", async (req, res) => {
      const task_id = req.params.task_id;
      const query = { _id: new ObjectId(task_id) };
      const updateDoc = {
        $inc: { required_workers: 1 },
      };
      const result = await tasksCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // worker routes
    app.post("/submission-task", async (req, res) => {
      const submissionTasks = req.body;

      // Check if a submission already exists for the user and task
      const isExist = await submissionsCollection.findOne({
        task_id: submissionTasks.task_id,
        worker_email: submissionTasks.worker_email,
      });

      if (isExist) {
        return res.status(400).json({
          success: false,
          message: "You have already applied for this task.",
        });
      }

      // Insert new submission
      const result = await submissionsCollection.insertOne(submissionTasks);
      res.send({ success: true, result });
    });

    app.patch("/decrease-required-workers/:task_id", async (req, res) => {
      const task_id = req.params.task_id;
      const query = { _id: new ObjectId(task_id) };
      const updateDoc = {
        $inc: { required_workers: -1 },
      };
      const result = await tasksCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    app.get("/approved-submissions/:email", async (req, res) => {
      const email = req.params.email;
      const query = { worker_email: email, status: "approved" };
      const result = await submissionsCollection.find(query).toArray();
      res.send(result);
    });
    app.patch("/tasks/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const { required_workers } = req.body;
      const updateDoc = {
        $set: { required_workers },
      };
      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result);
    });
    app.post("/withdraw", async (req, res) => {
      const withdrawInfo = req.body;
      const result = await withdrawalCollection.insertOne(withdrawInfo);
      res.send(result);
    });
    app.get("/worker-stats/:email",verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { worker_email: email };
      const totalSubmissionsCount = await submissionsCollection.countDocuments(
        query
      );
      const totalPendingCount = await submissionsCollection.countDocuments({
        worker_email: email,
        status: "pending",
      });
      const totalEarningsData = await submissionsCollection
        .aggregate([
          {
            $match: {
              worker_email: email,
              status: "approved",
            },
          },
          {
            $group: {
              _id: null,
              totalEarnings: { $sum: "$payable_amount" },
            },
          },
        ])
        .toArray();

      const totalEarnings =
        totalEarningsData.length > 0 ? totalEarningsData[0].totalEarnings : 0;

      res.send({ totalSubmissionsCount, totalPendingCount, totalEarnings });
    });
    //   admin routes
    app.get("/all-users", async (req, res) => {
      const result = await usersCollection.find().sort({ coins: -1 }).toArray();
      res.send(result);
    });
    app.get("/best-worker", async (req, res) => {
      const result = await usersCollection
        .find({ user_role: "worker" })
        .sort({ coins: -1 })
        .toArray();
      res.send(result);
    });
    app.get("/withdraws", async (req, res) => {
      const result = await withdrawalCollection.find().toArray();
      res.send(result);
    });
    app.patch("/update-withdrawal-status/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const { status } = req.body;
      const updateDoc = {
        $set: { status },
      };
      const result = await withdrawalCollection.updateOne(query, updateDoc);
      res.send(result);
    });
    app.delete("/delete-user/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });
    app.patch("/update-user-role/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const { role } = req.body;
      const updateDoc = {
        $set: { user_role: role },
      };
      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result);
    });
    app.get("/admin-stats",verifyToken, async (req, res) => {
      const totalWorkers = await usersCollection.countDocuments({
        user_role: "worker",
      });
      const totalBuyers = await usersCollection.countDocuments({
        user_role: "buyer",
      });
      const totalCoinsData = await usersCollection
        .aggregate([
          {
            $group: {
              _id: null,
              totalCoins: { $sum: "$coins" },
            },
          },
        ])
        .toArray();
      const totalAvailableCoinsData =
        totalCoinsData.length > 0 ? totalCoinsData[0].totalCoins : 0;
      const totalPaymentData = await withdrawalCollection
        .aggregate([
          {
            $match: { status: "approved" },
          },
          {
            $addFields: {
              withDrawal_coins_init: { $toInt: "$withdrawal_coin" },
            },
          },
          {
            $group: {
              _id: null,
              totalPayment: { $sum: "$withDrawal_coins_init" },
            },
          },
        ])
        .toArray();
      const totalPayment =
        totalPaymentData.length > 0 ? totalPaymentData[0].totalPayment : 0;
      res.send({
        totalWorkers,
        totalBuyers,
        totalAvailableCoinsData,
        totalPayment,
      });
    });
    app.get("/buyer-stats/:email",verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { buyer_email: email };
      const totalTasksCount = await tasksCollection.countDocuments(
        query
      );
      const totalPendingTasks = await submissionsCollection.countDocuments({
        buyer_email: email,
        status: "pending",
      });
      const totalPaymentPaid = await submissionsCollection.countDocuments({
        buyer_email: email,
        status: "approved",
      });


      res.send({ totalTasksCount, totalPendingTasks, totalPaymentPaid });
    });
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
