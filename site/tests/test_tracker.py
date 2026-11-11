"""python3 -m unittest discover -s tests   (from site/)"""
import datetime, importlib.util, pathlib, sys, unittest
ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import tracker
spec = importlib.util.spec_from_file_location("update_companies", ROOT / "scripts" / "update_companies.py")
uc = importlib.util.module_from_spec(spec); spec.loader.exec_module(uc)

FORM4 = b"""<?xml version="1.0"?><ownershipDocument><issuer><issuerTradingSymbol>TEST</issuerTradingSymbol></issuer>
<reportingOwner><reportingOwnerId><rptOwnerName>DOE JANE</rptOwnerName></reportingOwnerId>
<reportingOwnerRelationship><isDirector>0</isDirector><isOfficer>1</isOfficer><officerTitle>Chief Financial Officer</officerTitle></reportingOwnerRelationship></reportingOwner>
<aff10b5One>0</aff10b5One><nonDerivativeTable>
<nonDerivativeTransaction><transactionDate><value>2026-11-03</value></transactionDate><transactionCoding><transactionCode>P</transactionCode></transactionCoding>
<transactionAmounts><transactionShares><value>1000</value></transactionShares><transactionPricePerShare><value>10</value></transactionPricePerShare></transactionAmounts>
<postTransactionAmounts><sharesOwnedFollowingTransaction><value>5000</value></sharesOwnedFollowingTransaction></postTransactionAmounts></nonDerivativeTransaction>
<nonDerivativeTransaction><transactionDate><value>2026-11-04</value></transactionDate><transactionCoding><transactionCode>P</transactionCode></transactionCoding>
<transactionAmounts><transactionShares><value>3000</value></transactionShares><transactionPricePerShare><value>12</value></transactionPricePerShare></transactionAmounts>
<postTransactionAmounts><sharesOwnedFollowingTransaction><value>8000</value></sharesOwnedFollowingTransaction></postTransactionAmounts></nonDerivativeTransaction>
<nonDerivativeTransaction><transactionDate><value>2026-11-04</value></transactionDate><transactionCoding><transactionCode>F</transactionCode></transactionCoding>
<transactionAmounts><transactionShares><value>200</value></transactionShares><transactionPricePerShare><value>12</value></transactionPricePerShare></transactionAmounts></nonDerivativeTransaction>
</nonDerivativeTable></ownershipDocument>"""

class Form4(unittest.TestCase):
    def test_groups_by_code_and_weights_price(self):
        rows = {r["code"]: r for r in uc.parse_form4(FORM4, {"acc": "0001-26-1", "filed": "2026-11-05", "url": "https://x"})}
        buy = rows["P"]
        self.assertEqual((buy["kind"], buy["shares"], buy["value"], buy["price"], buy["after"]), ("buy", 4000, 46000, 11.5, 8000))
        self.assertEqual(buy["owner"], "Doe Jane"); self.assertEqual(buy["role"], "Chief Financial Officer")
        self.assertEqual(rows["F"]["kind"], "other")      # tax withholding is not an investment decision

class Earnings(unittest.TestCase):
    def setUp(self): self._t = uc.TODAY; uc.TODAY = datetime.date(2026, 11, 11)
    def tearDown(self): uc.TODAY = self._t
    def test_uses_last_years_date_when_close(self):
        self.assertEqual(uc.estimate_earnings(["2025-11-06", "2026-02-26", "2026-05-07", "2026-08-06", "2026-11-05"]), "2027-02-25")
    def test_short_history_adds_a_quarter(self):
        self.assertEqual(uc.estimate_earnings(["2026-05-13", "2026-08-12"]), "2026-11-11")
    def test_overdue_or_empty_gives_none(self):
        self.assertIsNone(uc.estimate_earnings([])); self.assertIsNone(uc.estimate_earnings(["2026-03-01"]))

CO = {"ticker": "TEST", "name": "Test Inc.", "edgar_url": "https://e", "next_earnings_estimate": "2026-12-01",
      "filings": [{"id": "a1", "form": "8-K", "date": "2026-11-05", "items": ["9.01", "2.02"], "url": "u"},
                  {"id": "a2", "form": "8-K/A", "date": "2026-11-01", "items": ["7.01"], "url": "u"},
                  {"id": "a3", "form": "424B5", "date": "2026-10-01", "items": [], "url": "u"}],
      "insider": [{"id": "f1:P", "date": "2026-11-03", "filed": "2026-11-04", "owner": "Doe Jane", "role": "Director", "code": "P", "kind": "buy", "shares": 1000, "price": 10.0, "value": 10000, "planned": False, "url": "u"},
                  {"id": "f2:F", "date": "2026-11-03", "filed": "2026-11-04", "owner": "Doe Jane", "role": "Director", "code": "F", "kind": "other", "shares": 10, "price": 10.0, "value": 100, "planned": False, "url": "u"},
                  {"id": "f3:S", "date": "2025-01-03", "filed": "2025-01-04", "owner": "Doe Jane", "role": "Director", "code": "S", "kind": "sell", "shares": 10, "price": 10.0, "value": 100, "planned": True, "url": "u"}],
      "trials": [{"id": "NCT1", "title": "Study", "status": "RECRUITING", "phase": "Phase 2", "primary_completion": "2027-01", "url": "t"}]}
TODAY = datetime.date(2026, 11, 11)

class Tracker(unittest.TestCase):
    def test_filing_labels(self):
        text, imp = tracker.filing_text(CO["filings"][0]); self.assertEqual(text["en"], "Financial results released"); self.assertTrue(imp)
        text, imp = tracker.filing_text(CO["filings"][1]); self.assertIn("(amended)", text["en"]); self.assertFalse(imp)
        self.assertIn("razvodnjavanje", tracker.filing_text(CO["filings"][2])[0]["hr"])
    def test_timeline_skips_routine_insider_rows(self):
        ev = tracker.events(CO)
        self.assertEqual([e["kind"] for e in ev], ["filing", "buy", "filing", "filing", "sell"])
        self.assertIn("1.000 dionica po 10,00 $", ev[1]["text"]["hr"]); self.assertIn("1,000 shares at $10.00", ev[1]["text"]["en"])
        self.assertIn("10b5-1", ev[4]["text"]["en"])
    def test_insider_summary_window(self):
        s = tracker.insider_summary(CO, TODAY)
        self.assertEqual((s["buys"], s["buy_value"], s["sells"], s["other"]), (1, 10000, 0, 1))
    def test_calendar_manual_replaces_estimate(self):
        db = {"companies": {"TEST": CO}}
        cal = tracker.calendar(db, [], TODAY)
        self.assertEqual([(c["type"], c["estimate"]) for c in cal], [("earnings", True), ("trial", True)])
        self.assertEqual(cal[1]["date"], "2027-01-28")
        manual = [{"date": "2026-11-20", "ticker": "TEST", "type": "earnings", "title": {"hr": "x", "en": "y"}}, {"date": "2020-01-01", "ticker": "TEST", "type": "earnings", "title": {"hr": "x", "en": "y"}}]
        cal = tracker.calendar(db, manual, TODAY)
        self.assertEqual([(c["date"], c["estimate"]) for c in cal if c["type"] == "earnings"], [("2026-11-20", False)])
    def test_scorecard(self):
        latest = {"TEST": {"type": "EQUITY", "last": 12.0, "session_date": "2026-11-10", "name": "Test Inc."}, "IWM": {"type": "ETF", "last": 210.0, "session_date": "2026-11-10"}, "^X": {"type": "INDEX", "last": 1}}
        snap = {"2026-10-01": {"TEST": {"last": 10.0}, "IWM": {"last": 200.0}}}
        posts = [{"dir": "p1", "date": "2026-10-02", "categories": ["research"], "tickers": ["^X", "TEST"], "prices_session": "2026-10-01"},
                 {"dir": "p2", "date": "2026-10-03", "categories": ["markets"], "tickers": ["TEST"], "prices_session": "2026-10-01"}]
        rows = tracker.scorecard(posts, latest, lambda s: snap.get(s, {}))
        self.assertEqual(len(rows), 1); self.assertEqual((rows[0]["ticker"], rows[0]["pct"], rows[0]["bench_pct"]), ("TEST", 20.0, 5.0))

if __name__ == "__main__":
    unittest.main()
