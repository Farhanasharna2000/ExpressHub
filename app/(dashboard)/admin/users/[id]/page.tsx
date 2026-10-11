import { AdminUserDetailView } from "@/features/admin/user-detail";

export const metadata = { title: "User Details" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminUserDetailView key={id} id={id} />;
}
