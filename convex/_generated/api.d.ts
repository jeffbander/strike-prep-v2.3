/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as departments from "../departments.js";
import type * as exports from "../exports.js";
import type * as healthSystems from "../healthSystems.js";
import type * as hospitals from "../hospitals.js";
import type * as jobTypes from "../jobTypes.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_deletion from "../lib/deletion.js";
import type * as matching from "../matching.js";
import type * as providers from "../providers.js";
import type * as seed from "../seed.js";
import type * as services from "../services.js";
import type * as skills from "../skills.js";
import type * as units from "../units.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  departments: typeof departments;
  exports: typeof exports;
  healthSystems: typeof healthSystems;
  hospitals: typeof hospitals;
  jobTypes: typeof jobTypes;
  "lib/auth": typeof lib_auth;
  "lib/deletion": typeof lib_deletion;
  matching: typeof matching;
  providers: typeof providers;
  seed: typeof seed;
  services: typeof services;
  skills: typeof skills;
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
