export function GET(request: Request) {
  return Response.redirect(new URL("/brand/prime-logo.png", request.url), 307);
}
