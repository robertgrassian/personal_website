// Preview it by visiting /opengraph-image in your browser.
import { ImageResponse } from 'next/og'

export const size = {
  width: 1200,
  height: 630,
}

export const contentType = 'image/png'

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          // Cream to dark blue gradient
          background: 'linear-gradient(135deg, #8dbef6ff 0%, #002a61ff 100%)',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px',
          }}
        >
          {/* Initials */}
          <div
            style={{
              fontSize: '160px',
              fontWeight: 700,
              color: '#1a1a1a',
              letterSpacing: '-4px',
              lineHeight: 1,
            }}
          >
            RG
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
