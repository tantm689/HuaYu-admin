import { ImageResponse } from 'next/og'

export const size = { width: 64, height: 64 }
export const contentType = 'image/png'

// Same 華 mark as the User app's icon (app/icon.tsx there), but in the
// Admin app's own navy palette (--primary: #33456b in app/globals.css)
// rather than the User app's red - so two open tabs are easy to tell apart
// at a glance, while still reading as the same product family.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 16,
          background: 'linear-gradient(135deg, #33456b, #1c2333)',
          color: '#EEF1F6',
          fontSize: 40,
          fontWeight: 700,
        }}
      >
        華
      </div>
    ),
    { ...size }
  )
}
