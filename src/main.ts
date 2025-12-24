import _ from "lodash";
import moment from "moment";
import YahooFinance from "yahoo-finance2";
import type { ChartResultArrayQuote } from "yahoo-finance2/modules/chart";
import type { QuoteSummaryResult } from "yahoo-finance2/modules/quoteSummary-iface";
import type { AnnualStatement, QuarterlyStatement } from "./types";
import { log } from "./utils";

const equities = [
	// "SPY",
	// "QQQ",
	// "EUNL.DE",
	// "URTH",
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

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

async function fetchSummary(symbol: string) {
	return await yahooFinance.quoteSummary(symbol,
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
}

const pricesCache = new Map<string, ChartResultArrayQuote[]>();

async function fetchPrices(symbol: string, fromDate?: Date) {
	const period1 = fromDate ? moment(fromDate) : moment().subtract(2, "years");

	if (pricesCache.has(symbol)) {
		const cachedPrices = pricesCache.get(symbol)!;
		if (cachedPrices.length > 0) {
			const cachedPeriod1 = moment(cachedPrices[0]!.date);
			if (cachedPeriod1.isSameOrBefore(period1, "day")) {
				return cachedPrices;
			}
		}
	}

	const chart = await yahooFinance.chart(symbol, {
		period1: period1.format("YYYY-MM-DD"),
		period2: moment().format("YYYY-MM-DD"),
	});

	pricesCache.set(symbol, chart.quotes);
	return chart.quotes;
}

function priceOn(date: Date, prices: ChartResultArrayQuote[]) {
	const earliestPrice = _.minBy(prices, p => moment(p.date).valueOf());
	if (earliestPrice && moment(date).isBefore(moment(earliestPrice.date), "day")) {
		throw new Error(`Requested date ${moment(date).format("YYYY-MM-DD")} is before the earliest available price date ${moment(earliestPrice.date).format("YYYY-MM-DD")}`);
	}

	return prices
		.filter(price => moment(price.date).isSame(date, "day") || moment(price.date).isBefore(date, "day"))
		.sort((a, b) => moment(b.date).diff(moment(a.date)))[0]?.close!;
}

function processSummary(quoteSummary: QuoteSummaryResult) {
	return {
		symbol: quoteSummary.price?.symbol,
		name: quoteSummary?.price?.longName,
		quoteType: quoteSummary.price?.quoteType,
		marketCap: quoteSummary.price?.marketCap,
		priceCurrency: quoteSummary.price?.currency,
		financialStatementCurrency: quoteSummary.financialData?.financialCurrency,
		marketPrice: quoteSummary.price?.regularMarketPrice,
		beta: quoteSummary.defaultKeyStatistics?.beta,
		profitMargin: quoteSummary.financialData?.profitMargins,
		operatingMargin: quoteSummary.financialData?.operatingMargins,
		sharesOutstanding: quoteSummary.defaultKeyStatistics?.sharesOutstanding,
		earningsQuarterlyGrowth: quoteSummary.defaultKeyStatistics?.earningsQuarterlyGrowth,
		earningsAnnualGrowth: quoteSummary.financialData?.earningsGrowth,
		quarterlyRevenueGrowth: quoteSummary.financialData?.revenueGrowth,
		trailingEPS: quoteSummary.defaultKeyStatistics?.trailingEps,
		forwardEPS: quoteSummary.defaultKeyStatistics?.forwardEps,
		trailingPE: quoteSummary.summaryDetail?.trailingPE,
		forwardPE: quoteSummary.summaryDetail?.forwardPE,
		nextEarningsDate: quoteSummary.calendarEvents?.earnings.earningsDate[0],
		fiftyTwoWeekRange: (() => {
			const price = quoteSummary.price?.regularMarketPrice!;
			const low = quoteSummary.summaryDetail?.fiftyTwoWeekLow!;
			const high = quoteSummary.summaryDetail?.fiftyTwoWeekHigh!;
			return (price - low) / (high - low);
		})(),
		// freeCashFlowYield: (() => {
		// 	const fcf = cashFlowData?.latest.freeCashFlow;
		// 	const marketCap = quoteSummary.price?.marketCap;
		// 	return fcf && marketCap ? (fcf / marketCap) : undefined;
		// })(),
		// freeCashFlowPerShare: (() => {
		// 	const fcf = cashFlowData?.latest.freeCashFlow;
		// 	const sharesOutstanding = quoteSummary.defaultKeyStatistics?.sharesOutstanding;
		// 	return fcf && sharesOutstanding ? fcf / sharesOutstanding : undefined;
		// })(),
	};
}

async function fetchQuarterlyStatements(symbol: string) {
	const response: unknown[] = await yahooFinance.fundamentalsTimeSeries(symbol, {
		period1: moment().subtract(2, "years").format("YYYY-MM-DD"),
		type: "quarterly",
		module: "all"
	}, { validateResult: false });
	return response.filter(item => (item as { TYPE: string }).TYPE === "ALL") as QuarterlyStatement[];
}

async function fetchAnnualStatements(symbol: string) {
	const response: unknown[] = await yahooFinance.fundamentalsTimeSeries(symbol, {
		period1: moment().subtract(5, "years").format("YYYY-MM-DD"),
		period2: moment().format("YYYY-MM-DD"),
		type: "annual",
		module: "all"
	}, { validateResult: false });
	return response.filter(item => (item as { TYPE: string }).TYPE === "ALL") as AnnualStatement[];
}

async function convertCurrencyInStatements<T extends QuarterlyStatement | AnnualStatement>(statements: T[], fromCurrency: string, toCurrency: string): Promise<T[]> {
	const pair = `${fromCurrency}${toCurrency}=X`;
	const rates = await fetchPrices(pair, moment().subtract(5, "years").toDate());

	const nonCurrencyFields = new Set([
		"date",
		"periodType",
		"TYPE",
		"basicAverageShares",
		"dilutedAverageShares",
		"ordinarySharesNumber",
		"shareIssued",
		"taxRateForCalcs"
	]);

	return statements.map(statement => {
		const rate = priceOn(moment(statement.date).toDate(), rates);
		const converted = { ...statement };

		for (const key of Object.keys(statement)) {
			const k = key as keyof T;
			const value = statement[k];
			if (typeof value === "number" && !nonCurrencyFields.has(key)) {
				(converted as any)[key] = value * rate;
			}
		}
		return converted;
	});
}

function calculateTrailingStatistics(allStatements: QuarterlyStatement[], prices: ChartResultArrayQuote[]) {
	if (allStatements.length < 4) {
		return null;
	}

	const statements = _(allStatements).sortBy(s => moment(s.date).valueOf()).takeRight(4).value();
	const lastStatement = statements[statements.length - 1]!;
	const sharesOutstanding = lastStatement.basicAverageShares ?? lastStatement.ordinarySharesNumber;
	if (!sharesOutstanding) {
		throw new Error("Shares outstanding not found");
	}
	const netIncome = _(statements).map(statement => statement.netIncome).sum();
	const freeCashFlow = _(statements).map(statement => statement.freeCashFlow).sum();
	const date = moment(lastStatement.date).toDate();
	const close = priceOn(date, prices);
	const marketCap = close * sharesOutstanding;
	return {
		date: date,
		close: close,
		sharesOutstanding: sharesOutstanding,
		marketCap: marketCap,
		netIncome: netIncome,
		freeCashFlow: freeCashFlow,
		eps: netIncome / sharesOutstanding,
		pe: marketCap / netIncome,
		fcfYield: freeCashFlow / marketCap
	};
}

function calculateGrowth(statementsInput: (QuarterlyStatement | AnnualStatement)[]) {
	if (statementsInput.length < 4) {
		return null;
	}

	const statements = _(statementsInput).sortBy(s => moment(s.date).valueOf()).takeRight(4).value();
	const firstStatement = statements[0];
	const lastStatement = statements[statements.length - 1];

	if (!firstStatement || !lastStatement) {
		return null;
	}
	const intervals = statements.length - 1;

	const revenueGrowth = (() => {
		const start = firstStatement.totalRevenue;
		const end = lastStatement.totalRevenue;
		if (!start || !end || start <= 0 || end <= 0) {
			return null;
		}
		return Math.pow(end / start, 1 / intervals) - 1;
	})();

	const earningsGrowth = (() => {
		const start = firstStatement.netIncome;
		const end = lastStatement.netIncome;
		if (!start || !end || start <= 0 || end <= 0) {
			return null;
		}
		// Note: CAGR is problematic if start value is negative. 
		// For simplicity and typical financial reporting, we return null if start earnings are non-positive.
		return Math.pow(end / start, 1 / intervals) - 1;
	})();

	return {
		revenue: revenueGrowth,
		earnings: earningsGrowth
	};
}

async function processSymbol(symbol: string) {
	const quoteSummary = await fetchSummary(symbol);
	const summary = processSummary(quoteSummary);
	const priceCurrency = summary.priceCurrency;
	const statementCurrency = summary.financialStatementCurrency;

	const prices = summary.quoteType === "EQUITY" ? await fetchPrices(symbol) : [];
	let annualStatements = summary.quoteType === "EQUITY" ? await fetchAnnualStatements(symbol) : [];
	let quarterlyStatements = summary.quoteType === "EQUITY" ? await fetchQuarterlyStatements(symbol) : [];

	if (priceCurrency && statementCurrency && priceCurrency !== statementCurrency) {
		annualStatements = await convertCurrencyInStatements(annualStatements, statementCurrency!, priceCurrency!);
		quarterlyStatements = await convertCurrencyInStatements(quarterlyStatements, statementCurrency!, priceCurrency!);
	}

	const thisQuarter = calculateTrailingStatistics(quarterlyStatements, prices);
	const previousQuarter = (() => {
		const previousQuarterStatements = _(quarterlyStatements)
			.sortBy(s => moment(s.date).valueOf())
			.dropRight(1)
			.takeRight(4)
			.value();

		if (previousQuarterStatements.length < 4) {
			return null;
		}
		return calculateTrailingStatistics(previousQuarterStatements, prices);
	})();

	const annualGrowth = calculateGrowth(annualStatements);
	const quarterlyGrowth = calculateGrowth(quarterlyStatements);

	// TODO: If last quarterly growth is unavailable, fetch annual TTM statistics directly from the API

	return {
		summary,
		thisQuarter,
		previousQuarter,
		revenueGrowth: {
			annual: annualGrowth?.revenue,
			quarterly: quarterlyGrowth?.revenue
		},
		earningsGrowth: {
			annual: annualGrowth?.earnings,
			quarterly: quarterlyGrowth?.earnings
		}
	};
}

async function main() {
	log(symbol);
	const result = await processSymbol(symbol);
	console.log(JSON.stringify(result, null, 4));
}

main();
