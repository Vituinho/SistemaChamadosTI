import Tracking from "./tracking";
export default async function Page({ params }: { params: Promise<{ protocol: string }> }) {
  const { protocol } = await params;
  return <Tracking protocol={protocol} />;
}
