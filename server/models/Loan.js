const mongoose = require("mongoose");

const DAY = 24 * 60 * 60 * 1000;

// Every loan lasts exactly 1 week
const LOAN_DAYS = 7;

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

const loanSchema = new mongoose.Schema(
  {
    borrower: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Borrower",
      required: true,
    },
    collateral: { type: String, required: true, trim: true },
    amountTaken: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: "Amount must be a whole number",
      },
    },
    dateGiven: { type: Date, required: true, default: Date.now },
    interestRate: { type: Number, required: true, default: 35 },
    lateChargeRate: { type: Number, required: true, default: 35 },
    cleared: { type: Boolean, default: false },
    dateCleared: { type: Date },
    lateChargePaid: { type: Number, default: 0 },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Due date = date given + 7 days
loanSchema.virtual("dueDate").get(function () {
  const due = new Date(this.dateGiven);
  due.setDate(due.getDate() + LOAN_DAYS);
  return due;
});

// Profit = amount taken x weekly rate (one week only)
loanSchema.virtual("profit").get(function () {
  return Math.round(this.amountTaken * (this.interestRate / 100));
});

loanSchema.virtual("amountToBringBack").get(function () {
  return this.amountTaken + this.profit;
});

// Any started week past the due date counts as one overdue week
loanSchema.virtual("weeksOverdue").get(function () {
  if (this.cleared) return 0;
  const daysLate = Math.round(
    (startOfDay(new Date()) - startOfDay(this.dueDate)) / DAY
  );
  return daysLate > 0 ? Math.ceil(daysLate / 7) : 0;
});

loanSchema.virtual("lateCharge").get(function () {
  if (this.cleared) return this.lateChargePaid;
  return Math.round(
    this.amountTaken * (this.lateChargeRate / 100) * this.weeksOverdue
  );
});

loanSchema.virtual("totalToPayNow").get(function () {
  return this.amountToBringBack + this.lateCharge;
});

loanSchema.virtual("overdueStage").get(function () {
  if (this.cleared) return "Cleared";
  if (this.weeksOverdue > 0) return `Overdue ${this.weeksOverdue}`;
  return "On time";
});

module.exports = mongoose.model("Loan", loanSchema);