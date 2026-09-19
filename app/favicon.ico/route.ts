export function GET(request: Request) {
  return Response.redirect(new URL("/brand/prime-bot-icon.png", request.url), 307);
}
