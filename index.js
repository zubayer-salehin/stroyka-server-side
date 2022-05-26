const express = require('express')
const app = express()
const cors = require('cors');
require("dotenv").config()
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const jwt = require('jsonwebtoken');


app.use(express.json())
app.use(cors())

app.get('/', (req, res) => {
    res.send('Hello World!')
})



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.bdkak.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ "Unauthorized": "access" })
    }
    const token = authHeader.split(" ")[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ "Unauthorized": "Forbidden access" })
        }
        req.decoded = decoded;
        next();
    });
}


async function run() {
    try {
        await client.connect();
        const partsCollection = client.db("masterTech").collection("parts");
        const ordersCollection = client.db("masterTech").collection("orders");
        const paymentCollection = client.db("masterTech").collection("payment");
        const reveiwCollection = client.db("masterTech").collection("reveiws");
        const userCollection = client.db("masterTech").collection("user");

        app.post("/create-payment-intent", async (req, res) => {
            const order = req.body;
            const price = order.price;
            const amount = price;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ["card"]
            });
            res.send({ clientSecret: paymentIntent.client_secret });
        })

        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester })
            if (requesterAccount.role === "admin") {
                next();
            } else {
                return res.status(403).send({ message: "forbidden" });
            }
        }

        app.get("/admin/:email", async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email })
            const isAdmin = user.role === "admin"
            res.send({ admin: isAdmin })
        })

        app.get("/parts", async (req, res) => {
            const result = await partsCollection.find().toArray();
            res.send(result);
        })

        app.get("/parts/:id", verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const result = await partsCollection.findOne(query);
            res.send(result);
        })

        app.post("/parts", async (req, res) => {
            const newParts = req.body;
            const name = newParts.name;
            const query = { name: name }
            const exists = await partsCollection.findOne(query)
            if (exists) {
                return res.send({ success: false })
            }
            const result = await partsCollection.insertOne(newParts);
            res.send({ success: true, result });
        })

        app.delete("/parts/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const result = await partsCollection.deleteOne(query);
            res.send(result);
        })

        app.get('/allOrders', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await ordersCollection.find().toArray();
            res.send(result);
        })

        app.get('/orders', verifyJWT, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;
            if (email === decodedEmail) {
                const query = { email: email }
                const orders = await ordersCollection.find(query).toArray();
                return res.send(orders);
            } else {
                return res.status(403).send({ "message": "Forbidden access" })
            }
        })

        app.get('/orders/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const booking = await ordersCollection.findOne(query);
            res.send(booking);
        })

        app.post("/orders", async (req, res) => {
            const orders = req.body;
            const result = await ordersCollection.insertOne(orders);
            res.send({ success: true, result });
        })

        app.put('/orders/:id', async (req, res) => {
            const id = req.params.id;
            const orderInformation = req.body;
            const payment = {
                orderId: orderInformation.orderId,
                transactionId: orderInformation.transactionId
            }
            const quantity = orderInformation.quantity;
            const partsId = orderInformation.partsId;
            const partsFilter = { _id: ObjectId(partsId) }
            const singleParts = await partsCollection.findOne(partsFilter);
            const singlePartsQuantity = singleParts.quantity;
            const filter = { _id: ObjectId(id) };
            const options = { upsert: true }
            const updatedDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId
                }
            }
            const updatedQuantity = {
                $set: {
                    quantity: singlePartsQuantity - quantity
                }
            }
            const result = await paymentCollection.insertOne(payment);
            const updatePartsQuantity = await partsCollection.updateOne(partsFilter, updatedQuantity, options);
            const updatedOrder = await ordersCollection.updateOne(filter, updatedDoc);
            res.send(updatePartsQuantity);
        })

        app.delete('/orders/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const deleteOrder = await ordersCollection.deleteOne(query);
            res.send(deleteOrder);
        })

        app.get("/reveiws", async (req, res) => {
            const result = await reveiwCollection.find().toArray();
            res.send(result);
        })

        app.post("/reveiws", async (req, res) => {
            const newReveiws = req.body;
            const result = await reveiwCollection.insertOne(newReveiws);
            res.send({ success: true, result });
        })

        app.get("/allUser", verifyJWT, async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        })

        app.get("/user", verifyJWT, async (req, res) => {
            const email = req.query.email;
            const query = { email: email }
            const result = await userCollection.findOne(query);
            res.send(result);
        })

        app.put("/user/:email", async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true }
            const updateDoc = {
                $set: user,
            }
            const result = await userCollection.updateOne(filter, updateDoc, options)
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ result, token })
        })

        app.put("/user/admin/:email", verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const updateDoc = {
                $set: { role: "admin" }
            }
            const result = await userCollection.updateOne(filter, updateDoc)
            return res.send(result)
        })

        app.put("/userUpdate", async (req, res) => {
            const email = req.query.email;
            const updateUser = req.body;
            const filter = { email: email };
            const options = { upsert: true }
            const updateDoc = {
                $set: updateUser,
            }
            const result = await userCollection.updateOne(filter, updateDoc, options)
            res.send({ success: true, result })
        })

        app.delete('/user/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const deleteUser = await userCollection.deleteOne(query);
            res.send(deleteUser);
        })

    } finally {

    }
}

run().catch(console.dir)


app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})