import { supabase } from "../../integrations/supabase/client";
import { createSchoolDirectoryApi } from "./directory-api";

export const schoolDirectoryApi = createSchoolDirectoryApi(supabase);
