import YahooFinance from "yahoo-finance2";
import type { Quote } from "yahoo-finance2/modules/quote";
import type { QuoteSummaryResult } from "yahoo-finance2/modules/quoteSummary-iface";

const equities = [
	"SPY",
	"QQQ",
	"EUNL",
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

function mapToRecord(quote: Quote, quoteSummary: QuoteSummaryResult): unknown {
	return {
		symbol: quote.symbol,
		name: quote.shortName,
		marketCap: quote.marketCap,
		currency: quote.currency,
		marketPrice: quote.regularMarketPrice,
		tailingPE: quote.trailingPE,
		forwardPE: quote.forwardPE,
		priceToBook: quote.priceToBook,
		lastEarningsDate: quote.earningsTimestamp?.toISOString().split('T')[0],
		nextEarningsDate: quoteSummary.calendarEvents?.earnings.earningsDate[0]?.toISOString().split('T')[0],
		fiftyTwoWeekRatio: (quote.regularMarketPrice - quote.fiftyTwoWeekLow) / (quote.fiftyTwoWeekHigh - quote.fiftyTwoWeekLow)
	};
}

async function main() {
	const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
	const quote = await yahooFinance.quote(symbol);
	console.log("QUOTE");
	console.log(JSON.stringify(quote, null, 4));
	console.log("\n");

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

	const record = mapToRecord(quote, quoteSummary);
	console.log("RESULT");
	console.log(JSON.stringify(record, null, 4));
}

main();
