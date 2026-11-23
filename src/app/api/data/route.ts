import { getData } from "@/lib/fpl";
import { errorResponse } from "../error-response";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return Response.json(await getData());
  } catch (error) {
    return errorResponse(error);
  }
}
