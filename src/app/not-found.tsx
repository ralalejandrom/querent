import Link from "next/link";
export default function NotFound() {
  return <main className="main" id="main"><div className="empty"><b>Not found</b>This page doesn't exist or was removed. <Link href="/">Go to the feed</Link></div></main>;
}
