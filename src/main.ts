import moment from "moment";
import YahooFinance from "yahoo-finance2";
import type { QuoteSummaryResult } from "yahoo-finance2/modules/quoteSummary-iface";

const equities = [
	"SPY",
	"QQQ",
	"EUNL.DE",
	"URTH",
	"NVDA",
	"AAPL",
	"MSFT",
	"AMZN",
	"GOOGL",
	"AVGO",
	"META",
	"NFLX",
	"ASML",
	"COST"
];
const cliSymbol = process.argv[2];
const symbol = (cliSymbol && cliSymbol.trim()) || equities[Math.floor(Math.random() * equities.length)]!;

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });


function mapToRecord(quoteSummary: QuoteSummaryResult): unknown {
	return {
		symbol: quoteSummary.price?.symbol,
		name: quoteSummary?.longName,
		marketCap: quoteSummary.price?.marketCap,
		currency: quoteSummary.price?.currency,
		marketPrice: quoteSummary.price?.regularMarketPrice,
		beta: quoteSummary.defaultKeyStatistics?.beta,
		trailingPE: quoteSummary.summaryDetail?.trailingPE,
		forwardPE: quoteSummary.summaryDetail?.forwardPE,
		nextEarningsDate: (() => {
			const earningsDateString = quoteSummary.calendarEvents?.earnings.earningsDate[0]?.toISOString().split('T')[0];
			const earningsDate = earningsDateString ? moment(earningsDateString) : undefined;
			return earningsDate && earningsDate > moment() ? earningsDateString : undefined;
		})(),
		fiftyTwoWeekRange: (() => {
			const price = quoteSummary.price?.regularMarketPrice!;
			const low = quoteSummary.summaryDetail?.fiftyTwoWeekLow!;
			const high = quoteSummary.summaryDetail?.fiftyTwoWeekHigh!;
			return (price - low) / (high - low);
		})(),
		freeCashFlowYield: (() => {
			// TODO: this represents levered free cash flow yield, need to find unlevered FCF
			const fcf = quoteSummary.financialData?.freeCashflow;
			const marketCap = quoteSummary.price?.marketCap;
			return fcf && marketCap ? (fcf / marketCap) : undefined;
		})(),
		sharesOutstanding: quoteSummary.defaultKeyStatistics?.sharesOutstanding,
		freeCashFlowPerShare: (() => {
			const fcf = quoteSummary.financialData?.freeCashflow;
			const sharesOutstanding = quoteSummary.defaultKeyStatistics?.sharesOutstanding;
			return fcf && sharesOutstanding ? fcf / sharesOutstanding : undefined;
		})()
	};
}

async function main() {
	const quoteSummary = await yahooFinance.quoteSummary(symbol,
		{
			modules:
				[
					"price",
					"summaryDetail",
					"defaultKeyStatistics",
					"financialData",
					"calendarEvents",
				]
		});
	console.log("QUOTE SUMMARY");
	console.log(JSON.stringify(quoteSummary, null, 4));
	console.log("\n");

	const cashFlowData = await yahooFinance.fundamentalsTimeSeries(symbol, {
		period1: moment().subtract(2, 'years').format('YYYY-MM-DD'),
		type: 'trailing',
		module: 'cash-flow'
	}, { validateResult: false });
	console.log("CASH FLOW");
	console.log(JSON.stringify(cashFlowData, null, 4));
	console.log("\n");

	console.log(cashFlowData.map((e: any) => new Date(e.date * (e.date < 1e12 ? 1000 : 1))));

	const financialsData = await yahooFinance.fundamentalsTimeSeries(symbol, {
		period1: moment().subtract(2, 'years').format('YYYY-MM-DD'),
		type: 'trailing',
		module: "financials"
	}, { validateResult: false });
	console.log("FINANCIALS");
	console.log(JSON.stringify(financialsData, null, 4));
	console.log("\n");

	console.log(financialsData.map((e: any) => new Date(e.date * (e.date < 1e12 ? 1000 : 1))));

	const record = mapToRecord(quoteSummary);
	console.log("RESULT");
	console.log(JSON.stringify(record, null, 4));
}

main();
