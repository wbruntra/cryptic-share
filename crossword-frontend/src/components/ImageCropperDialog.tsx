import { useState, useRef, useEffect } from 'react'
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'

interface ImageCropperDialogProps {
  imageSrc: string
  onCancel: () => void
  onCropComplete: (croppedBlob: Blob) => void
}

function centerAspectCrop(mediaWidth: number, mediaHeight: number, aspect: number) {
  return centerCrop(
    makeAspectCrop(
      {
        unit: '%',
        width: 90,
      },
      aspect,
      mediaWidth,
      mediaHeight,
    ),
    mediaWidth,
    mediaHeight,
  )
}

export function ImageCropperDialog({
  imageSrc,
  onCancel,
  onCropComplete,
}: ImageCropperDialogProps) {
  const [crop, setCrop] = useState<Crop>()
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>()
  const imgRef = useRef<HTMLImageElement>(null)
  const [processing, setProcessing] = useState(false)

  // Initial center crop
  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { width, height } = e.currentTarget
    // Start with a centered crop, free aspect
    const initialCrop = centerCrop(
      {
        unit: '%',
        width: 80,
        height: 80,
        x: 10,
        y: 10,
      },
      width,
      height,
    )
    setCrop(initialCrop)
    setCompletedCrop({
      unit: 'px',
      x: width * 0.1,
      y: height * 0.1,
      width: width * 0.8,
      height: height * 0.8,
    })
  }

  const handleSave = async () => {
    if (!completedCrop || !imgRef.current) return
    setProcessing(true)

    try {
      const image = imgRef.current
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')

      if (!ctx) {
        throw new Error('No 2d context')
      }

      const scaleX = image.naturalWidth / image.width
      const scaleY = image.naturalHeight / image.height

      const cropWidth = completedCrop.width * scaleX
      const cropHeight = completedCrop.height * scaleY
      const maxOutputSize = 1600
      const resizeScale = Math.min(1, maxOutputSize / Math.max(cropWidth, cropHeight))

      const outputWidth = Math.floor(cropWidth * resizeScale)
      const outputHeight = Math.floor(cropHeight * resizeScale)

      canvas.width = outputWidth
      canvas.height = outputHeight

      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'

      const cropX = completedCrop.x * scaleX
      const cropY = completedCrop.y * scaleY

      ctx.drawImage(
        image,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        0,
        0,
        outputWidth,
        outputHeight,
      )

      canvas.toBlob(
        (blob) => {
          if (blob) {
            onCropComplete(blob)
          } else {
            console.error('Canvas is empty')
            setProcessing(false)
          }
        },
        'image/jpeg',
        0.9,
      )
    } catch (e) {
      console.error(e)
      setProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-surface w-full max-w-4xl rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-border flex justify-between items-center bg-surface z-10">
          <h3 className="text-lg font-bold text-text">Crop Image</h3>
          <button
            onClick={onCancel}
            className="text-text-secondary hover:text-text p-1 rounded-full hover:bg-bg/50 transition-colors cursor-pointer"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="relative flex-1 bg-black overflow-auto p-4 flex items-center justify-center">
          <ReactCrop
            crop={crop}
            onChange={(c) => setCrop(c)}
            onComplete={(c) => setCompletedCrop(c)}
            className="max-h-full"
          >
            <img
              ref={imgRef}
              src={imageSrc}
              onLoad={onImageLoad}
              className="max-w-full max-h-[70vh] object-contain"
              alt="Crop me"
            />
          </ReactCrop>
        </div>

        <div className="p-4 bg-surface border-t border-border flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-text font-medium hover:bg-bg transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={processing}
            className="px-6 py-2 rounded-xl bg-primary text-white font-bold hover:bg-primary-hover shadow-lg hover:shadow-primary/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2"
          >
            {processing ? (
              <>
                <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin"></div>
                Processing...
              </>
            ) : (
              'Crop & Continue'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
