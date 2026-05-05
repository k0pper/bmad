import type { Metadata } from 'next'
import { Providers } from '@/components/shared/Providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'FollowCV',
  description: 'Your passive-first job search tracker',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
