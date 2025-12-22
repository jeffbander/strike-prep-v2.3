/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auditLogs from "../auditLogs.js";
import type * as departments from "../departments.js";
import type * as exports from "../exports.js";
import type * as healthSystems from "../healthSystems.js";
import type * as hospitals from "../hospitals.js";
import type * as http from "../http.js";
import type * as jobTypes from "../jobTypes.js";
import type * as laborPool from "../laborPool.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_cascade from "../lib/cascade.js";
import type * as lib_deletion from "../lib/deletion.js";
import type * as matching from "../matching.js";
import type * as providerAvailability from "../providerAvailability.js";
import type * as providers from "../providers.js";
import type * as scenarioMatching from "../scenarioMatching.js";
import type * as scenarios from "../scenarios.js";
import type * as seed from "../seed.js";
import type * as seedDemo from "../seedDemo.js";
import type * as services from "../services.js";
import type * as skills from "../skills.js";
import type * as sms from "../sms.js";
import type * as units from "../units.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auditLogs: typeof auditLogs;
  departments: typeof departments;
  exports: typeof exports;
  healthSystems: typeof healthSystems;
  hospitals: typeof hospitals;
  http: typeof http;
  jobTypes: typeof jobTypes;
  laborPool: typeof laborPool;
  "lib/auth": typeof lib_auth;
  "lib/cascade": typeof lib_cascade;
  "lib/deletion": typeof lib_deletion;
  matching: typeof matching;
  providerAvailability: typeof providerAvailability;
  providers: typeof providers;
  scenarioMatching: typeof scenarioMatching;
  scenarios: typeof scenarios;
  seed: typeof seed;
  seedDemo: typeof seedDemo;
  services: typeof services;
  skills: typeof skills;
  sms: typeof sms;
  units: typeof units;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
