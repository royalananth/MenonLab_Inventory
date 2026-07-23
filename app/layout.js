import "./globals.css";

export const metadata = {
  title: "Menon Lab Inventory",
  description: "Shared reagent inventory and usage logging for the Menon Laboratory",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Menon Lab" },
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
};
export const viewport = { themeColor: "#0E7C86", width: "device-width", initialScale: 1, maximumScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <script dangerouslySetInnerHTML={{ __html: `if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}` }} />
      </body>
    </html>
  );
}
