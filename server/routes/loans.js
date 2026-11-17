const express = require("express");
const Loan = require("../models/Loan");
const Borrower = require("../models/Borrower");

const router = express.Router();

// SUMMARY: the totals row from the sheet
// (this must stay above "/:id", or "summary" would be read as an id)
router.get("/summary", async (req, res) => {
  try {
    const loans = await Loan.find();
    const open = loans.filter((l) => !l.cleared);
    const cleared = loans.filter((l) => l.cleared);
    const sum = (list, field) => list.reduce((total, l) => total + l[field], 0);

    const lateChargesAdded = sum(loans, "lateCharge");

    res.json({
      totalLoans: loans.length,
      totalLent: sum(loans, "amountTaken"),
      totalToComeBack: sum(loans, "amountToBringBack"),
      totalProfit: sum(loans, "profit"),
      loansOverdue: open.filter((l) => l.weeksOverdue > 0).length,
      loansStillOpen: open.length,
      lateChargesAdded,
      totalOwedInclLate: sum(loans, "amountToBringBack") + lateChargesAdded,
      stillToCollect: sum(open, "totalToPayNow"),
      profitEarnedCleared: sum(cleared, "profit"),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// CREATE a loan
router.post("/", async (req, res) => {
  try {
    const borrower = await Borrower.findById(req.body.borrower);
    if (!borrower) return res.status(400).json({ message: "Borrower not found" });

    const loan = await Loan.create(req.body);
    res.status(201).json(loan);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// READ all loans (optionally only one borrower's: /api/loans?borrower=ID)
router.get("/", async (req, res) => {
  try {
    const filter = req.query.borrower ? { borrower: req.query.borrower } : {};
    const loans = await Loan.find(filter)
      .populate("borrower", "name phone")
      .sort({ dateGiven: -1 });
    res.json(loans);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// READ one loan
router.get("/:id", async (req, res) => {
  try {
    const loan = await Loan.findById(req.params.id).populate(
      "borrower",
      "name phone"
    );
    if (!loan) return res.status(404).json({ message: "Loan not found" });
    res.json(loan);
  } catch (err) {
    res.status(400).json({ message: "Invalid loan ID" });
  }
});

// UPDATE a loan
router.put("/:id", async (req, res) => {
  try {
    const loan = await Loan.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!loan) return res.status(404).json({ message: "Loan not found" });
    res.json(loan);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// MARK AS CLEARED
router.patch("/:id/clear", async (req, res) => {
  try {
    const loan = await Loan.findById(req.params.id);
    if (!loan) return res.status(404).json({ message: "Loan not found" });
    if (loan.cleared) {
      return res.status(400).json({ message: "Loan is already cleared" });
    }

    loan.lateChargePaid = loan.lateCharge; // lock in the late charge as it stands today
    loan.cleared = true;
    loan.dateCleared = new Date();
    await loan.save();

    res.json(loan);
  } catch (err) {
    res.status(400).json({ message: "Invalid loan ID" });
  }
});

// DELETE a loan
router.delete("/:id", async (req, res) => {
  try {
    const loan = await Loan.findByIdAndDelete(req.params.id);
    if (!loan) return res.status(404).json({ message: "Loan not found" });
    res.json({ message: "Loan deleted" });
  } catch (err) {
    res.status(400).json({ message: "Invalid loan ID" });
  }
});

module.exports = router;