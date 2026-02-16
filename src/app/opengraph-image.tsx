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
          // Burnt orange to white gradient
          background: 'linear-gradient(135deg, #cc5500 0%, #f4a460 45%, #ffffff 100%)',
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

          {/* Full name underneath */}
          <div
            style={{
              fontSize: '36px',
              fontWeight: 400,
              color: '#44403c',
              letterSpacing: '8px',
              textTransform: 'uppercase' as const,
            }}
          >
            Robert Grassian
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
