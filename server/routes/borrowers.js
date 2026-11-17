const express = require("express");
const Borrower = require("../models/Borrower");
const Loan = require("../models/Loan");

const router = express.Router();

// CREATE a borrower
router.post("/", async (req, res) => {
  try {
    const borrower = await Borrower.create(req.body);
    res.status(201).json(borrower);
  } catch (err) {
    if (err.code === 11000) {
      return res
        .status(400)
        .json({ message: "A borrower with this phone number already exists" });
    }
    res.status(400).json({ message: err.message });
  }
});

// READ all borrowers
router.get("/", async (req, res) => {
  try {
    const borrowers = await Borrower.find().sort({ name: 1 });
    res.json(borrowers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// READ one borrower
router.get("/:id", async (req, res) => {
  try {
    const borrower = await Borrower.findById(req.params.id);
    if (!borrower) return res.status(404).json({ message: "Borrower not found" });
    res.json(borrower);
  } catch (err) {
    res.status(400).json({ message: "Invalid borrower ID" });
  }
});

// UPDATE a borrower
router.put("/:id", async (req, res) => {
  try {
    const borrower = await Borrower.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!borrower) return res.status(404).json({ message: "Borrower not found" });
    res.json(borrower);
  } catch (err) {
    if (err.code === 11000) {
      return res
        .status(400)
        .json({ message: "A borrower with this phone number already exists" });
    }
    res.status(400).json({ message: err.message });
  }
});

// DELETE a borrower (blocked if they have loan records)
router.delete("/:id", async (req, res) => {
  try {
    const hasLoans = await Loan.exists({ borrower: req.params.id });
    if (hasLoans) {
      return res.status(400).json({
        message: "This borrower has loan records, so they can't be deleted",
      });
    }
    const borrower = await Borrower.findByIdAndDelete(req.params.id);
    if (!borrower) return res.status(404).json({ message: "Borrower not found" });
    res.json({ message: "Borrower deleted" });
  } catch (err) {
    res.status(400).json({ message: "Invalid borrower ID" });
  }
});

module.exports = router;