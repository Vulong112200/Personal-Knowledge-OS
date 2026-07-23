export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-bg flex min-h-screen flex-1 items-center justify-center bg-background px-4">
      {children}
    </div>
  );
}
