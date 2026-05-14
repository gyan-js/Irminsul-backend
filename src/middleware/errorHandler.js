export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}

export function errorHandler(err, req, res, next) {
  const status = err.statusCode || 400;
  res.status(status).json({
    success: false,
    message: err.message || 'Something went wrong',
  });
}
