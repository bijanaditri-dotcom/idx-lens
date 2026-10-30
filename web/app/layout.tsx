import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata={title:'IDX Lens — Indonesian Market Intelligence',description:'See the Indonesian market through four lenses: fundamentals, technicals, smart money and sentiment.',icons:{icon:'/favicon.svg',shortcut:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
