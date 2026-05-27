import multer from 'multer';

const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (_req, file, cb) => {
    // Accept standard types + common aliases sent by mobile OSes:
    //   image/jpg  — non-standard alias for JPEG used by some Android versions
    //   image/heic / image/heif — iPhone default format (when synced to device)
    const allowedTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(`Invalid file type (${file.mimetype}). Please attach a JPEG, PNG, or WebP image.`)
      );
    }
  },
});
