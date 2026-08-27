import { http, HttpResponse } from "msw";
import { buildContractVersions, okResponse } from "../fixtures/contracts";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.example.com";

export const contractHandlers = [
  http.get(`${BASE_URL}/contracts/versions`, () => {
    return HttpResponse.json(okResponse(buildContractVersions()));
  }),
];
