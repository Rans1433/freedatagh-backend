const express = require("express");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const DATAMART_API_KEY = process.env.DATAMART_API_KEY;


// Keep track of references already processed
const processedPayments = new Set();


// HOME ROUTE
app.get("/", (req, res) => {
  res.json({
    message: "Kay'sDataGH backend is running"
  });
});


// VERIFY PAYSTACK PAYMENT
app.get("/verify-payment/:reference", async (req, res) => {

  const reference = req.params.reference;

  try {

    // Prevent duplicate processing
    if (processedPayments.has(reference)) {
      return res.status(409).json({
        success: false,
        message: "This payment has already been processed"
      });
    }


    // Verify payment with Paystack
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const payment = response.data.data;


    // Check payment status
    if (payment.status !== "success") {
      return res.json({
        success: false,
        message: "Payment was not successful",
        status: payment.status
      });
    }


// Check currency
if (payment.currency !== "GHS") {
  return res.status(400).json({
    success: false,
    message: "Invalid payment currency"
  });
}


// Get order information
const metadata = payment.metadata || {};

const network = metadata.network;
const bundle = metadata.bundle;
const recipient = metadata.recipient;


// Make sure order information exists
if (!network || !bundle || !recipient) {
  return res.status(400).json({
    success: false,
    message: "Order information is missing"
  });
}


// Expected prices for each bundle
const bundlePrices = {
  "1GB": 5,
  "2GB": 10,
  "5GB": 25,
  "10GB": 50,
  "20GB": 100
};


// Check that the bundle exists
const expectedPrice = bundlePrices[bundle];

if (!expectedPrice) {
  return res.status(400).json({
    success: false,
    message: "Invalid bundle"
  });
}


// Paystack amount is in pesewas
const expectedAmount = expectedPrice * 100;


// Check exact amount paid
if (Number(payment.amount) !== expectedAmount) {
  return res.status(400).json({
    success: false,
    message: "Payment amount does not match the selected bundle"
  });
}



    // Only MTN for now
    if (network !== "MTN") {
      return res.status(400).json({
        success: false,
        message: "This network is not supported yet"
      });
    }


    // Convert "1GB" → "1"
    const capacity = bundle.replace("GB", "");


    // Create DataMart order
    const dataResponse = await axios.post(
      "https://api.datamartgh.shop/api/developer/purchase",
      {
        phoneNumber: recipient,
        network: "YELLO",
        capacity: capacity,
        gateway: "wallet",
        ref: `FDG-${reference}`
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": DATAMART_API_KEY
        }
      }
    );


    // Mark payment as processed ONLY after
    // DataMart successfully accepts the order
    processedPayments.add(reference);

return res.status(201).json({
  success: true,
  message: "Payment verified and DataMart order created",

  reference: reference,

  dataMartReference:
    dataResponse.data?.data?.orderReference,

  processingMethod:
    dataResponse.data?.data?.processingMethod,

  dataOrder: dataResponse.data
});


} catch (error) {
  console.error(
    "ERROR:",
    error.response?.data || error.message
  );

  const requestUrl = error.config?.url || "";

  // Paystack verification error
  if (requestUrl.includes("api.paystack.co")) {
    return res.status(error.response?.status || 500).json({
      success: false,
      message: "Could not verify payment with Paystack",
      details: error.response?.data || error.message
    });
  }

  // DataMart order error
  if (requestUrl.includes("api.datamartgh.shop")) {
    return res.status(error.response?.status || 500).json({
      success: false,
      message: "DataMart order could not be created",
      details: error.response?.data || error.message
    });
  }

  // General error
  return res.status(500).json({
    success: false,
    message: "Could not verify payment",
    details: error.response?.data || error.message
  });
}
});


// CHECK DATAMART WALLET BALANCE
// CHECK DATAMART WALLET BALANCE
app.get("/balance", async (req, res) => {

  try {

    const response = await axios.get(
      "https://api.datamartgh.shop/api/developer/balance",
      {
        headers: {
          "X-API-Key": DATAMART_API_KEY
        }
      }
    );

    res.json(response.data);

  } catch (error) {

    console.error(
      "BALANCE ERROR:",
      error.response?.data || error.message
    );

    res.status(error.response?.status || 500).json({
      success: false,
      message: "Could not check DataMart balance",
      details: error.response?.data || error.message
    });

  }

});


// CHECK DATAMART ORDER STATUS
app.get("/order-status/:reference", async (req, res) => {

  const reference = req.params.reference;

  try {

    const response = await axios.get(
      `https://api.datamartgh.shop/api/developer/order-status/${reference}`,
      {
        headers: {
          "X-API-Key": DATAMART_API_KEY
        }
      }
    );

    res.json(response.data);

  } catch (error) {

    console.error(
      "ORDER STATUS ERROR:",
      error.response?.data || error.message
    );

    res.status(error.response?.status || 500).json({
      success: false,
      message: "Could not get DataMart order status",
      details: error.response?.data || error.message
    });

  }

});


// CHECK DATAMART DELIVERY TRACKER
app.get("/delivery-tracker", async (req, res) => {

  try {

    const response = await axios.get(
      "https://api.datamartgh.shop/api/developer/delivery-tracker",
      {
        headers: {
          "X-API-Key": DATAMART_API_KEY
        }
      }
    );

    res.json(response.data);

  } catch (error) {

    console.error(
      "DELIVERY TRACKER ERROR:",
      error.response?.data || error.message
    );

    res.status(error.response?.status || 500).json({
      success: false,
      message: "Could not get DataMart delivery tracker",
      details: error.response?.data || error.message
    });

  }

});


// TERMS OF SERVICE PAGE
app.get("/TermsofService", (req, res) => {
  res.sendFile(__dirname + "/Terms.html");
});


// PRIVACY POLICY PAGE
app.get("/PrivacyPolicy", (req, res) => {
  res.sendFile(__dirname + "/Privacy.html");
});


// START SERVER
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

