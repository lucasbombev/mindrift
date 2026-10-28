const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

export async function preparePhoto(file) {
  if (!file) return null;
  if (!file.type.startsWith('image/')) {
    throw new Error('Selecione um arquivo de imagem (JPG, PNG ou WebP).');
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error('A foto original é muito grande. Use uma imagem de até 20 MB.');
  }

  let source;
  try {
    source = await createImageBitmap(file);
  } catch {
    source = await loadImageElement(file);
  }

  const maxSide = 1280;
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);
  source.close?.();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
  if (!blob) throw new Error('Não foi possível processar a foto.');
  return new File([blob], `carrinho-${Date.now()}.jpg`, { type: 'image/jpeg' });
}

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Formato de imagem não suportado. Use JPG, PNG ou WebP.'));
    };
    image.src = url;
  });
}
