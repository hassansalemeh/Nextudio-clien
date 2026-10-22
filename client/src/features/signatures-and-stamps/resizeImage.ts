const MAX_DIMENSION = 1200

function readFileAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Could not read the file.'))
    reader.readAsDataURL(file)
  })
}

function loadImage(dataUri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not read the image.'))
    image.src = dataUri
  })
}

// Scales the image down in the browser so its longest side is at most 1200px, before it's ever sent to
// the server - admins can upload their original, full-resolution files without hitting the size limit or
// having to shrink them by hand first. A PNG stays a PNG (so transparency survives the resize); an
// already-small image is left untouched rather than re-encoded.
export async function resizeImageForUpload(file: File): Promise<{ mimeType: string; base64: string }> {
  const dataUri = await readFileAsDataUri(file)
  const image = await loadImage(dataUri)
  const scale = Math.min(1, MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight))

  if (scale === 1) {
    return { mimeType: file.type, base64: dataUri.slice(dataUri.indexOf(',') + 1) }
  }

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(image.naturalWidth * scale)
  canvas.height = Math.round(image.naturalHeight * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not resize the image.')
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)

  const resizedDataUri = canvas.toDataURL(file.type, file.type === 'image/jpeg' ? 0.9 : undefined)
  return { mimeType: file.type, base64: resizedDataUri.slice(resizedDataUri.indexOf(',') + 1) }
}
