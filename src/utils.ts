import moment from "moment";

export function log(text: string) {
    const timestamp = moment().format("YYYY-MM-DD HH:mm:ss.SSS");
    console.log(`${timestamp} >> ${text}`);
}