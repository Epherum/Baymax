const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function ordinal(n: number) {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function formatFriendlyDate(input?: string | null) {
    if (!input) return "";
    const d = new Date(input);
    if (Number.isNaN(d.getTime())) return input;

    const now = new Date();
    const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.floor((startOfDay(now).getTime() - startOfDay(d).getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays > 1 && diffDays < 7) {
        return `Last ${d.toLocaleDateString(undefined, { weekday: "long" })}`;
    }

    const year = d.getFullYear();
    const thisYear = now.getFullYear();
    const monthName = MONTHS[d.getMonth()];
    const day = ordinal(d.getDate());
    if (year === thisYear) {
        return `${monthName} ${day}`;
    }
    return `${monthName} ${day} ${year}`;
}
