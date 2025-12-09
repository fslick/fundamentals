import moment from "moment";
import YahooFinance from "yahoo-finance2";
import type { QuoteSummaryResult } from "yahoo-finance2/modules/quoteSummary-iface";
import type { CashFlow } from "./types.js";

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

async function fetchCashFlowDataTTM(): Promise<CashFlow | null> {
	const cashFlowData = await yahooFinance.fundamentalsTimeSeries(symbol, {
		period1: moment().subtract(2, 'years').format('YYYY-MM-DD'),
		type: 'trailing',
		module: 'cash-flow'
	}, { validateResult: false });

	if (cashFlowData.length === 0) {
		return null;
	}

	const mostRecent = cashFlowData.reduce((latest: any, current: any) => {
		return current.date > latest.date ? current : latest;
	});

	const dateInSeconds = mostRecent.date < 1e12 ? mostRecent.date : mostRecent.date / 1000;
	return {...mostRecent, date: moment.unix(dateInSeconds)};
}

function mapToRecord(quoteSummary: QuoteSummaryResult, cashFlowData: CashFlow | null): unknown {
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
			const fcf = cashFlowData?.freeCashFlow;
			const marketCap = quoteSummary.price?.marketCap;
			return fcf && marketCap ? (fcf / marketCap) : undefined;
		})(),
		sharesOutstanding: quoteSummary.defaultKeyStatistics?.sharesOutstanding,
		freeCashFlowPerShare: (() => {
			const fcf = cashFlowData?.freeCashFlow;
			const sharesOutstanding = quoteSummary.defaultKeyStatistics?.sharesOutstanding;
			return fcf && sharesOutstanding ? fcf / sharesOutstanding : undefined;
		})(),
		revenueGrowthYoY: quoteSummary.financialData?.revenueGrowth,
		earningsGrowthYoY: quoteSummary.financialData?.earningsGrowth
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

	const cashFlow = await fetchCashFlowDataTTM();
	console.log("CASH FLOW");
	console.log(JSON.stringify(cashFlow, null, 4));
	console.log("\n");

	const financialsData = await yahooFinance.fundamentalsTimeSeries(symbol, {
		period1: moment().subtract(2, 'years').format('YYYY-MM-DD'),
		type: 'trailing',
		module: "financials"
	}, { validateResult: false });
	console.log("FINANCIALS");
	console.log(JSON.stringify(financialsData, null, 4));
	console.log("\n");

	console.log(financialsData.map((e: any) => new Date(e.date * (e.date < 1e12 ? 1000 : 1))));

	const record = mapToRecord(quoteSummary, cashFlow);
	console.log("RESULT");
	console.log(JSON.stringify(record, null, 4));
}

main();
