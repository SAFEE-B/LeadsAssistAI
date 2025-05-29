import pandas as pd
import os
import glob # Used for finding files matching a pattern
import re # Import regex module
import logging # Using logging for clearer output
from itertools import product # To generate all combinations
import numpy as np # Needed for np.nan if used for Notes/Email

# =================== CONFIGURATION (Combined) =================== #

# --- Logging Setup ---
# Change level to logging.DEBUG to see more detailed filtering steps
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Folder Configuration ---
INPUT_FOLDER_NAME = "Files"
OUTPUT_FOLDER_NAME = "Outputs"
QUERIES_FILENAME = "queriesToSearch.txt"

# --- Business Type Configuration ---
TARGET_BUSINESS_TYPES_INPUT = "Warehouses, factories, gyms, apartment buildings, middle schools, high schools, nursing homes, mobile home parks, RV parks, trailer parks, auto repair shops, laundromats, motels"

# --- Consolidated Query Category ---
# Ensure these are lowercase and match potential data variations after lowercasing
CONSOLIDATED_RV_TYPES = {'rv park', 'mobile home park', 'trailer park',
                         'rv parks', 'mobile home parks', 'trailer parks', 'campground', 'campgrounds'}
# Use 'mobile home park' as the representative when generating queries if none of the above are found for a zip
REPRESENTATIVE_RV_TYPE = 'mobile home park'

# --- Source File Prioritization ---
DEFAULT_FILE_PREFIX = "default"
SCRAPED_NEW_SOURCE_NAME = "Scraped New"

# --- Zip Code Search Specific ---
ADDRESS_COLUMN = "Business Address"
SOURCE_FILE_COLUMN = "Source File" # This is the column name for the source
FINAL_DEDUPLICATION_COLUMN = "Phone Number"
OUTPUT_FILENAME = "test.xlsx"
ZIP_CHECK_LENGTH = 30
# Example zip codes - replace with your actual list or reading from a file if preferred
zip_codes_input = "28006, 28012, 28025, 28027, 28031, 28032, 28034, 28036, 28052, 28054, 28056, 28075, 28078, 28079, 28081, 28083, 28097, 28098, 28101, 28104, 28105, 28107, 28108, 28110, 28112, 28120, 28134, 28163, 28164, 28173, 28174, 28202, 28203, 28204, 28205, 28206, 28207, 28208, 28209, 28210, 28211, 28212, 28213, 28214, 28215, 28216, 28217, 28223, 28226, 28227, 28244, 28262, 28269, 28270, 28273, 28274, 28277, 28278, 28280, 28282, 29704, 29707, 29708, 29710, 29715, 29730, 29732, 29733"

zip_codes = [zip_code.strip() for zip_code in zip_codes_input.split(',') if zip_code.strip()]
zip_pattern = '|'.join([r'\b' + re.escape(code) + r'\b' for code in zip_codes]) if zip_codes else ''

# --- Filters/Formatting ---
US_Filter = ["United States"]
State_Filter=['WA']
unwanted_value_filters = {
    "# of Reviews": 'No reviews', "Rating": 'No ratings', "Latest Review": 'No review date',
    "Latest Review Date": 'No review date', "Phone Number": 'No phone number', "Business Address": 'No address'
}
# Updated Column Widths to include Notes and Email
column_widths = {
    SOURCE_FILE_COLUMN: 15,
    "Type of Business": 20,
    "Sub-Category": 18,
    "Name of Business": 30,
    "Website": 25,
    "# of Reviews": 12,
    "Rating": 10,
    "Latest Review": 20,
    "Business Address": 50,
    "Phone Number": 15,
    "Notes": 20,  # Added width for Notes
    "Email": 25   # Added width for Email
}

# =================== HELPER FUNCTIONS =================== #

def generate_target_business_types(input_string):
    """Generates lowercase target variations and an ordered base list."""
    target_set = set()
    base_list = []
    if not input_string:
        return target_set, base_list
    # Improved cleaning: handle 'and', split by comma, strip whitespace, lowercase
    cleaned_string = input_string.replace(' and', ',')
    parsed_types = [t.strip().lower() for t in cleaned_string.split(',') if t.strip()]
    # Use dict.fromkeys to preserve order while removing duplicates for base list
    base_list = list(dict.fromkeys(parsed_types))

    for base_type in base_list:
        target_set.add(base_type)
        # Simple singular/plural generation (can be expanded if needed)
        if base_type.endswith('s'):
            singular = base_type[:-1]
            if base_type.endswith('ies'): # factories -> factory
                target_set.add(base_type[:-3] + 'y')
            # Avoid making plurals like 'ss' or removing 's' from words like 'bus'
            elif len(singular) > 1 and (not singular.endswith('s') or len(singular) < 3):
                 target_set.add(singular) # warehouses -> warehouse
        else:
            plural = base_type + 's'
            target_set.add(plural) # gym -> gyms
            # Handle 'y' ending plurals like factory -> factories
            if base_type.endswith('y') and len(base_type) > 1 and base_type[-2] not in 'aeiou':
                target_set.add(base_type[:-1] + 'ies') # factory -> factories

    logging.info(f"Target business base terms (for queries): {base_list}")
    logging.info(f"Generated target business variations (for filtering): {sorted(list(target_set))}")
    return target_set, base_list

TARGET_BUSINESS_TYPES_SET, TARGET_BUSINESS_TYPES_BASE_LIST = generate_target_business_types(TARGET_BUSINESS_TYPES_INPUT)

def clean_and_filter_dataframe(df, filename="Unknown"):
    """Applies cleaning and filtering rules, including TARGET_BUSINESS_TYPES_SET."""
    initial_count = len(df)
    if df.empty: return df

    logging.debug(f"File: {filename} - Starting cleaning/filtering. Initial rows: {initial_count}")

    # --- Column Renaming/Standardization ---
    if "Latest Review Date" in df.columns and "Latest Review" not in df.columns:
        df.rename(columns={"Latest Review Date": "Latest Review"}, inplace=True)

    required_cols = ["Type of Business", "Sub-Category", "# of Reviews", "Rating", "Latest Review", "Phone Number", "Business Address"]
    actual_cols = df.columns
    missing_cols = [col for col in required_cols if col not in actual_cols]
    if missing_cols:
        logging.warning(f"File: {filename} - Missing required columns for cleaning: {', '.join(missing_cols)}. Skipping related cleaning/filtering steps.")

    # --- String Column Lowercasing (BEFORE Filtering/Standardizing) ---
    str_cols_to_lower = ["Type of Business", "Sub-Category"]
    for col in str_cols_to_lower:
        if col in df.columns:
            # Handle potential non-string data gracefully before lowercasing
            df[col] = df[col].astype(str).str.lower()
        else:
             logging.debug(f"File: {filename} - Column '{col}' not found for lowercasing.")


    # --- Filter Unwanted Placeholder Values ---
    count_before_placeholder_filter = len(df)
    for col, value in unwanted_value_filters.items():
        if col in df.columns:
            if isinstance(value, str):
                # Convert column to string and lowercase for comparison
                df = df[df[col].astype(str).str.lower() != value.lower()]
            else:
                df = df[df[col] != value]
    filtered_placeholder_count = count_before_placeholder_filter - len(df)
    if filtered_placeholder_count > 0:
        logging.debug(f"File: {filename} - Removed {filtered_placeholder_count} rows based on placeholder values.")

    # --- Clean Numeric/Date Columns ---
    if "# of Reviews" in df.columns:
        df["# of Reviews"] = df["# of Reviews"].astype(str).str.replace(',', '', regex=False)
        df["# of Reviews"] = pd.to_numeric(df["# of Reviews"], errors='coerce').fillna(0).astype(int)

    if "Latest Review" in df.columns:
        # Ensure it's string type before using .str methods
        df["Latest Review"] = df["Latest Review"].astype(str)
        df["Latest Review"] = df["Latest Review"].str.replace(r'on\s*\n*Google', '', regex=True).str.strip()
        count_before_ago_filter = len(df)
        # Filter rows that contain 'ago', handling NaN values
        df = df[df["Latest Review"].str.contains(r'\bago\b', case=False, na=False)]
        filtered_ago_count = count_before_ago_filter - len(df)
        if filtered_ago_count > 0:
             logging.debug(f"File: {filename} - Removed {filtered_ago_count} rows missing 'ago' in Latest Review.")
        # Extract only the part up to 'ago'
        # Fillna with the original value for rows that already matched the pattern or didn't contain 'ago' but passed the filter (shouldn't happen with na=False)
        df["Latest Review"] = df["Latest Review"].str.extract(r'^(.*?\bago\b)', expand=False).fillna(df["Latest Review"])
        df["Latest Review"] = df["Latest Review"].str.strip()


    # --- Business Type Filtering (using lowercase column) ---
    if "Type of Business" in df.columns and TARGET_BUSINESS_TYPES_SET:
        count_before_biz_filter = len(df)
        # Use the already lowercased column
        df = df[df["Type of Business"].isin(TARGET_BUSINESS_TYPES_SET)]
        filtered_biz_count = count_before_biz_filter - len(df)
        if filtered_biz_count > 0:
            logging.debug(f"File: {filename} - Filtered out {filtered_biz_count} rows based on target business types.")
    elif not TARGET_BUSINESS_TYPES_SET:
        logging.warning(f"File: {filename} - No target business types specified/generated. Skipping business type filtering.")
    elif "Type of Business" not in df.columns:
        logging.warning(f"File: {filename} - 'Type of Business' column not found. Skipping business type filtering.")

    # --- Other Filters ---
    if "Business Address" in df.columns:
        count_before_addr_filter = len(df)
        df = df[df["Business Address"].astype(str).str.contains(",", na=False)]
        filtered_addr_count = count_before_addr_filter - len(df)
        if filtered_addr_count > 0:
             logging.debug(f"File: {filename} - Removed {filtered_addr_count} rows with address missing comma.")
        count_before_us_filter = len(df)
        # Ensure ADDRESS_COLUMN exists before filtering
        if ADDRESS_COLUMN in df.columns:
            df = df[df[ADDRESS_COLUMN].astype(str).str.contains('|'.join(US_Filter), case=True, na=False)]
            filtered_us_count = count_before_us_filter - len(df)
            if filtered_us_count > 0:
                logging.debug(f"File: {filename} - Removed {filtered_us_count} rows not matching US filter.")
        else:
            logging.debug(f"File: {filename} - Column '{ADDRESS_COLUMN}' not found for US filter.")
            
        # if ADDRESS_COLUMN in df.columns:
        #     df = df[df[ADDRESS_COLUMN].astype(str).str.contains('|'.join(State_Filter), case=True, na=False)]
        #     filtered_us_count = count_before_us_filter - len(df)
        #     print('DoneXYZ')
        #     if filtered_us_count > 0:
        #         logging.debug(f"File: {filename} - Removed {filtered_us_count} rows not matching State filter.")
        # else:
        #     logging.debug(f"File: {filename} - Column '{ADDRESS_COLUMN}' not found for State filter.")


    if "# of Reviews" in df.columns:
        count_before_review_filter = len(df)
        df = df[df["# of Reviews"] >= 4]
        filtered_review_count = count_before_review_filter - len(df)
        if filtered_review_count > 0:
             logging.debug(f"File: {filename} - Removed {filtered_review_count} rows with < 4 reviews.")


    # --- Final Formatting (Title Case) ---
    str_cols_to_title = ["Type of Business", "Sub-Category", "Name of Business"]
    for col in str_cols_to_title:
        if col in df.columns:
            # Fill NA *before* title casing to avoid errors, then replace NaT/NaN if needed
            # Ensure column is string type before applying .str.title()
            df[col] = df[col].fillna('').astype(str).str.title()


    final_count = len(df)
    logging.debug(f"File: {filename} - Finished cleaning/filtering. Kept {final_count} out of {initial_count} rows.")
    return df

def get_sort_group(row):
    """
    Assigns a group ID for sorting based on Title Cased 'Type of Business'.
    Group 0 = Others, Group 1 = Schools, Group 2 = RV/Mobile/Trailer/Campground
    """
    # Ensure we handle potential NaN/None values gracefully before comparison
    business_type = row.get("Type of Business", "") if pd.notna(row.get("Type of Business")) else ""
    group_id = 0 # Default: Others

    # Comparisons should be case-sensitive as the column is Title Cased by now
    if business_type in ["High School", "High Schools", "Middle School", "Middle Schools"]:
         group_id = 1 # Schools
    elif business_type in ["Rv Park", "Rv Parks", "Mobile Home Park", "Mobile Home Parks", "Trailer Park", "Trailer Parks", "Campground", "Campgrounds"]:
         group_id = 2 # RV/Mobile/Trailer/Campground

    return group_id

# =================== MAIN SCRIPT LOGIC =================== #

def find_leads_by_zip():
    target_zip_codes_set = set(zip_codes) # Use set for efficient lookup
    if not target_zip_codes_set:
        logging.error("No zip codes defined. Exiting.")
        return
    representative_rv_type_lc = REPRESENTATIVE_RV_TYPE.lower()
    if not TARGET_BUSINESS_TYPES_BASE_LIST:
        logging.warning("TARGET_BUSINESS_TYPES_INPUT empty/invalid. Business type filtering/query generation skipped.")

    current_directory = os.getcwd()
    input_folder_path = os.path.join(current_directory, INPUT_FOLDER_NAME)
    output_folder_path = os.path.join(current_directory, OUTPUT_FOLDER_NAME)
    output_file_path = os.path.join(output_folder_path, OUTPUT_FILENAME)
    queries_file_path = os.path.join(output_folder_path, QUERIES_FILENAME)

    if not os.path.isdir(input_folder_path):
        logging.error(f"Input folder '{INPUT_FOLDER_NAME}' not found at: {input_folder_path}")
        return
    try:
        os.makedirs(output_folder_path, exist_ok=True)
        logging.info(f"Output will be saved to: {output_folder_path}")
    except OSError as e:
        logging.error(f"Error creating output directory '{output_folder_path}': {e}")
        return

    logging.info(f"Searching leads for zips: {', '.join(sorted(list(target_zip_codes_set)))}")
    if TARGET_BUSINESS_TYPES_BASE_LIST:
        logging.info(f"Filtering leads for target business types.")
    logging.info(f"Using zip check length: {ZIP_CHECK_LENGTH}. Prioritizing non-'{DEFAULT_FILE_PREFIX}' sources.")
    if not zip_pattern:
        logging.error("Zip code pattern is empty. Cannot filter by zip. Exiting.")
        return

    excel_files = glob.glob(os.path.join(input_folder_path, '*.xlsx'))
    if not excel_files:
        logging.warning(f"No Excel files found in: {input_folder_path}")

    list_file_leads, default_file_leads = [], []
    total_leads_found_list, total_leads_found_default = 0, 0

    if excel_files:
        logging.info(f"Processing {len(excel_files)} files in '{INPUT_FOLDER_NAME}'...")
        for file_path in excel_files:
            filename = os.path.basename(file_path)
            filename_lower = filename.lower()

            if filename_lower == OUTPUT_FILENAME.lower():
                logging.info(f"Skipping output file found in input folder: {filename}")
                continue

            is_default_file = filename_lower.startswith(DEFAULT_FILE_PREFIX.lower())
            file_type_label = "Default" if is_default_file else "List"
            logging.info(f"Processing [{file_type_label}]: {filename}")

            try:
                # Define potential string columns to avoid dtype guessing issues
                potential_str_cols = [
                    ADDRESS_COLUMN, "Phone Number", "Type of Business", "Sub-Category",
                    "Name of Business", "Website", "Latest Review", "# of Reviews", "Rating"
                ]
                dtype_spec = {col: str for col in potential_str_cols}
                df = pd.read_excel(file_path, engine='openpyxl', dtype=dtype_spec)
                logging.info(f"  Read {len(df)} rows.")
                df_cleaned = clean_and_filter_dataframe(df.copy(), filename)

                if df_cleaned.empty:
                    logging.info(f"  * No leads after cleaning/filtering.")
                    continue

                if ADDRESS_COLUMN not in df_cleaned.columns:
                    logging.warning(f"  * '{ADDRESS_COLUMN}' missing in cleaned data for {filename}. Skipping zip filter for this file.")
                    # Cannot filter by zip, so we keep all cleaned rows if ADDRESS_COLUMN is missing
                    # This might include rows outside target zips; consider if this is desired behavior.
                    # If only zip-matching rows are wanted overall, could skip adding these:
                    # logging.warning(f"  * Skipping addition of leads from {filename} as zip codes cannot be verified.")
                    # continue # Uncomment this line to skip files without address column entirely
                    zip_filtered_df = df_cleaned # Keep all cleaned if address missing, but log warning
                else:
                    logging.info(f"  Filtering {len(df_cleaned)} cleaned rows by zip code...")
                    address_str_series = df_cleaned[ADDRESS_COLUMN].astype(str).fillna('')
                    # Apply zip check only to the end of the string if it's long enough
                    check_series = address_str_series.apply(lambda x: x[-ZIP_CHECK_LENGTH:] if len(x) >= ZIP_CHECK_LENGTH else x)
                    mask = check_series.str.contains(zip_pattern, case=False, na=False, regex=True)
                    zip_filtered_df = df_cleaned[mask].copy() # Use .copy() to avoid SettingWithCopyWarning
                    logging.info(f"  Found {len(zip_filtered_df)} rows matching zip criteria.")

                if not zip_filtered_df.empty:
                    found_count = len(zip_filtered_df)
                    # Assign source name based on whether it's a default file or not
                    source_name = SCRAPED_NEW_SOURCE_NAME if is_default_file else filename
                    # Use .loc to assign the source file name safely
                    zip_filtered_df.loc[:, SOURCE_FILE_COLUMN] = source_name

                    if is_default_file:
                        default_file_leads.append(zip_filtered_df)
                        total_leads_found_default += found_count
                    else:
                        list_file_leads.append(zip_filtered_df)
                        total_leads_found_list += found_count
                    logging.info(f"  * Added {found_count} matching leads (source: {source_name}).")

            except FileNotFoundError:
                logging.error(f"  * File not found error for {file_path}.")
            except ValueError as ve:
                logging.error(f"  * Error processing {filename} (ValueError): {ve}. Check Excel file format/content.")
            except Exception as e:
                logging.exception(f"  * Unexpected error processing {filename}: {e}")

    # --- Combine DataFrames ---
    final_df = pd.DataFrame()
    all_dfs_to_concat = list_file_leads + default_file_leads
    if all_dfs_to_concat:
         logging.info(f"Combining {total_leads_found_list + total_leads_found_default} leads from all sources...")
         # Ensure SOURCE_FILE_COLUMN exists in all dfs before concat if assigned via .loc
         for df_part in all_dfs_to_concat:
             if SOURCE_FILE_COLUMN not in df_part.columns:
                 logging.warning(f"Source column '{SOURCE_FILE_COLUMN}' missing in a partial DataFrame before concat.")
                 # Add it with a placeholder if needed
                 df_part[SOURCE_FILE_COLUMN] = "Unknown Source During Concat"
         final_df = pd.concat(all_dfs_to_concat, ignore_index=True)
         logging.info(f"Total combined leads before deduplication: {len(final_df)}")
    else:
         logging.warning("No leads found matching criteria in any processed file.")


    # --- Prioritized Deduplication ---
    if FINAL_DEDUPLICATION_COLUMN in final_df.columns and not final_df.empty:
        logging.info(f"Performing prioritized deduplication on '{FINAL_DEDUPLICATION_COLUMN}'...")
        initial_count = len(final_df)
        # Ensure the deduplication column is string and stripped
        final_df[FINAL_DEDUPLICATION_COLUMN] = final_df[FINAL_DEDUPLICATION_COLUMN].astype(str).str.strip()
        # Drop rows where the deduplication key is missing or empty AFTER stripping
        final_df = final_df.dropna(subset=[FINAL_DEDUPLICATION_COLUMN])
        final_df = final_df[final_df[FINAL_DEDUPLICATION_COLUMN] != '']
        count_after_nan_drop = len(final_df)
        nan_removed = initial_count - count_after_nan_drop
        if nan_removed > 0:
            logging.info(f"  Removed {nan_removed} rows with missing/empty '{FINAL_DEDUPLICATION_COLUMN}'.")

        if not final_df.empty:
             if SOURCE_FILE_COLUMN not in final_df.columns:
                  logging.error(f"Source column '{SOURCE_FILE_COLUMN}' missing before deduplication. Cannot prioritize. Performing standard deduplication.")
                  final_df = final_df.drop_duplicates(subset=[FINAL_DEDUPLICATION_COLUMN], keep='first')
             else:
                 # Prioritize non-"Scraped New" sources (priority 0) over "Scraped New" (priority 1)
                 final_df['_source_priority'] = final_df[SOURCE_FILE_COLUMN].apply(lambda x: 0 if x != SCRAPED_NEW_SOURCE_NAME else 1)
                 # Sort by the deduplication key, then by priority (lower priority number kept)
                 final_df = final_df.sort_values(by=[FINAL_DEDUPLICATION_COLUMN, '_source_priority'], ascending=[True, True])
                 # Keep the first occurrence after sorting (which will be the highest priority source)
                 final_df = final_df.drop_duplicates(subset=[FINAL_DEDUPLICATION_COLUMN], keep='first').drop(columns=['_source_priority'])
                 removed_count = count_after_nan_drop - len(final_df)
                 if removed_count > 0:
                     logging.info(f"  Removed {removed_count} duplicate leads based on '{FINAL_DEDUPLICATION_COLUMN}', prioritizing non-'{SCRAPED_NEW_SOURCE_NAME}' sources.")
                 else:
                     logging.info("  No duplicate leads found needing prioritization.")
        else:
             logging.info("  Skipping deduplication - DataFrame empty after NaN/empty value drop.")
    elif not final_df.empty:
        logging.warning(f"Deduplication column '{FINAL_DEDUPLICATION_COLUMN}' not found. Skipping prioritized deduplication.")


    # --- Check for Missing Zip Codes (Overall) ---
    logging.info("--- Checking for Target Zip Codes With No Leads (Any Business Type) ---")
    found_zips_in_final_df = set()
    if ADDRESS_COLUMN in final_df.columns and not final_df.empty and zip_pattern:
        zip_presence_pattern = f'({zip_pattern})' # Parentheses to capture the zip
        try:
            # Use extractall to find all occurrences of any target zip within the address
            extracted_matches = final_df[ADDRESS_COLUMN].astype(str).str.extractall(zip_presence_pattern)
            if not extracted_matches.empty:
                # Get unique matched zip codes (index 0 of the capture group)
                found_zips_in_final_df = set(extracted_matches[0].dropna().unique())
                logging.info(f"  Found leads containing {len(found_zips_in_final_df)} target zip codes.")
            else:
                 logging.warning("  No target zip codes found within final address strings.")
        except re.error as re_err:
            logging.error(f"Regex error during final zip check: {re_err}. Pattern: {zip_presence_pattern}")
            logging.warning("  Skipping overall zip check due to regex error.")
        except Exception as e:
             logging.exception(f"Unexpected error during overall zip check: {e}")
             logging.warning("  Skipping overall zip check due to error.")

    elif final_df.empty and target_zip_codes_set:
         logging.warning(f"MISSING ZIPS: Final list empty. No leads for any target zip codes: {', '.join(sorted(list(target_zip_codes_set)))}")
    elif not target_zip_codes_set:
         logging.info("  No target zip codes were specified.")
    elif not zip_pattern:
         logging.warning("  Zip pattern is empty, cannot check for missing zips.")
    else: # final_df not empty, but ADDRESS_COLUMN missing
         logging.warning(f"  Skipping overall zip check - '{ADDRESS_COLUMN}' column missing in final DataFrame.")

    if target_zip_codes_set:
        missing_zips_overall = target_zip_codes_set - found_zips_in_final_df
        if missing_zips_overall:
            logging.warning(f"MISSING ZIPS (Overall): No leads found for ANY business type in zips: {', '.join(sorted(list(missing_zips_overall)))}")
        elif found_zips_in_final_df: # Only log success if zips were actually found
            logging.info("  All target zip codes have at least one lead (of some business type).")
    logging.info("--- End Overall Zip Code Check ---")


    # --- Check for Missing Business Type / Zip Code COMBINATIONS & Generate Queries (Consolidated RV Group) ---
    logging.info("--- Checking for Missing Business Type/Zip Code Combinations (Consolidated RV Group) & Generating Queries ---")
    missing_queries = []
    if TARGET_BUSINESS_TYPES_BASE_LIST and target_zip_codes_set and zip_pattern:
        # Separate base list into 'other' types and the consolidated RV group representative
        target_other_types = {t for t in TARGET_BUSINESS_TYPES_BASE_LIST if t not in CONSOLIDATED_RV_TYPES}
        consolidated_group_was_targeted = any(t in CONSOLIDATED_RV_TYPES for t in TARGET_BUSINESS_TYPES_BASE_LIST)

        logging.info(f"  Target 'Other' Types (lowercase, for query gen): {sorted(list(target_other_types)) if target_other_types else 'None'}")
        logging.info(f"  Consolidated RV Group Targeted: {consolidated_group_was_targeted} (Representative: '{representative_rv_type_lc}')")

        found_pairs_standardized = set()
        # Need 'Type of Business' (Title Cased) and ADDRESS_COLUMN for this check
        if "Type of Business" in final_df.columns and ADDRESS_COLUMN in final_df.columns and not final_df.empty:
            # Create a temporary DataFrame for safe manipulation
            cols_for_check = [ADDRESS_COLUMN, "Type of Business"]
            if all(col in final_df.columns for col in cols_for_check):
                df_temp = final_df[cols_for_check].copy()
                try:
                    # Standardize Type of Business: Lowercase and map consolidated types
                    df_temp['_lc_biz_type'] = df_temp["Type of Business"].astype(str).str.lower()
                    df_temp['_std_biz_type'] = df_temp['_lc_biz_type'].apply(
                        lambda x: representative_rv_type_lc if x in CONSOLIDATED_RV_TYPES else x
                    )

                    # Extract the *first* matching target zip code from each address
                    zip_extract_series = df_temp[ADDRESS_COLUMN].astype(str).str.extract(f'({zip_pattern})', expand=False)
                    df_temp['_found_zip'] = zip_extract_series # This will be NaN if no target zip found

                    # Drop rows where we couldn't find a target zip or have no business type
                    df_temp.dropna(subset=['_found_zip', '_std_biz_type'], inplace=True)

                    # Create the set of found (standardized_business_type, zip_code) pairs
                    found_pairs_standardized = set(tuple(x) for x in df_temp[['_std_biz_type', '_found_zip']].values)
                    logging.info(f"  Identified {len(found_pairs_standardized)} existing standardized (Business Type/Representative, Zip Code) combinations.")
                    del df_temp # Clean up temporary DataFrame

                except re.error as re_err:
                     logging.error(f"Regex error extracting zips for combination check: {re_err}")
                     logging.warning("  Cannot accurately determine existing combinations due to regex error.")
                except Exception as e:
                     logging.exception(f"Error preparing data for combination check: {e}")
                     logging.warning("  Cannot accurately determine existing combinations due to error.")
            else:
                missing_check_cols = [col for col in cols_for_check if col not in final_df.columns]
                logging.warning(f"  Missing columns required for combination check: {missing_check_cols}. Skipping.")

        elif final_df.empty:
            logging.warning("  Final DataFrame is empty. Cannot determine existing combinations.")
        else: # final_df not empty, but required columns are missing
            missing_req_cols = []
            if "Type of Business" not in final_df.columns: missing_req_cols.append("Type of Business")
            if ADDRESS_COLUMN not in final_df.columns: missing_req_cols.append(ADDRESS_COLUMN)
            logging.warning(f"  Required columns ({', '.join(missing_req_cols)}) missing for combination check. Skipping.")

        # --- Generate Missing Queries ---
        generated_query_count = 0
        # 1. Check for missing combinations of 'other' types and all target zips
        for biz_type_lc in sorted(list(target_other_types)):
            for zip_code in sorted(list(target_zip_codes_set)):
                if (biz_type_lc, zip_code) not in found_pairs_standardized:
                    # Format: "business type", "business type near zip code"
                    missing_queries.append(f'"{biz_type_lc}", "{biz_type_lc} near {zip_code}"')
                    generated_query_count += 1

        # 2. Check if the consolidated group was targeted and if its representative is missing in any zip
        if consolidated_group_was_targeted:
            missing_consolidated_zips_count = 0
            # Find zips where the representative type was found
            zips_where_consolidated_found = {pair[1] for pair in found_pairs_standardized if pair[0] == representative_rv_type_lc}
            missing_consolidated_zips_list = []
            for zip_code in sorted(list(target_zip_codes_set)):
                if zip_code not in zips_where_consolidated_found:
                    # Generate query using the representative type
                    missing_queries.append(f'"{representative_rv_type_lc}", "{representative_rv_type_lc} near {zip_code}"')
                    generated_query_count += 1
                    missing_consolidated_zips_count += 1
                    missing_consolidated_zips_list.append(zip_code)
            if missing_consolidated_zips_count > 0:
                 logging.warning(f"MISSING CONSOLIDATED GROUP: No leads found for representative '{representative_rv_type_lc}' (representing {CONSOLIDATED_RV_TYPES}) in {missing_consolidated_zips_count} target zip codes: {', '.join(missing_consolidated_zips_list)}")

        if generated_query_count > 0:
             logging.warning(f"MISSING COMBINATIONS: Determined {generated_query_count} (Business Type/Group, Zip Code) pairs needing queries.")
             logging.info(f"  Generating search queries for missing combinations...")
        elif TARGET_BUSINESS_TYPES_BASE_LIST and target_zip_codes_set: # Only log this if targets were defined
            logging.info("  All targeted (Business Type/Group, Zip Code) combinations were found in the existing data.")

        # --- Write Queries File ---
        if missing_queries:
            missing_queries.sort() # Sort the generated queries alphabetically
            try:
                with open(queries_file_path, 'w', encoding='utf-8') as f:
                    for query in missing_queries: f.write(query + '\n')
                logging.info(f"Successfully wrote {len(missing_queries)} search queries to '{queries_file_path}'.")
            except IOError as e:
                logging.error(f"Error writing queries to file '{queries_file_path}': {e}")
            except Exception as e:
                logging.exception(f"Unexpected error writing queries file: {e}")
        elif generated_query_count == 0 and (TARGET_BUSINESS_TYPES_BASE_LIST and target_zip_codes_set):
             logging.info(f"  No missing combination queries generated. File '{queries_file_path}' not created/overwritten.")

    else:
        log_reasons = []
        if not TARGET_BUSINESS_TYPES_BASE_LIST: log_reasons.append("no target business types defined")
        if not target_zip_codes_set: log_reasons.append("no target zip codes defined")
        if not zip_pattern: log_reasons.append("zip pattern could not be generated")
        logging.info(f"  Skipping check for missing combinations ({', '.join(log_reasons)}).")
    logging.info("--- End Missing Combination Check ---")


    # --- Final Sorting ---
    if not final_df.empty:
        # Ensure 'Type of Business' exists and is Title Case before sorting
        if "Type of Business" not in final_df.columns:
            final_df["Type of Business"] = "" # Add as empty string if missing
            logging.warning("Column 'Type of Business' was missing before final sort, added as empty.")
        # Apply Title Case again just to be sure, handling potential non-string data
        final_df["Type of Business"] = final_df["Type of Business"].astype(str).fillna('').str.title()

        # Calculate Sort Group based on the Title Cased 'Type of Business'
        final_df['Sort Group'] = final_df.apply(get_sort_group, axis=1)

        # Define base sort columns and order
        sort_columns = ['Sort Group', 'Type of Business']
        sort_ascending = [True, True] # Sort Group ascending, then Type of Business ascending

        # Add Sub-Category to sort if it exists
        if 'Sub-Category' in final_df.columns:
            # Ensure 'Sub-Category' is also Title Case for consistent sorting
            final_df["Sub-Category"] = final_df["Sub-Category"].astype(str).fillna('').str.title()
            sort_columns.append('Sub-Category')
            sort_ascending.append(True) # Sort Sub-Category ascending
            logging.info("Applying final sorting: by Group, Type of Business, and Sub-Category...")
        else:
            logging.warning("Column 'Sub-Category' not found in final data. Sorting only by Group and Type of Business.")
            logging.info("Applying final sorting: by Group and Type of Business...")

        # Perform the sort
        final_df = final_df.sort_values(by=sort_columns, ascending=sort_ascending, na_position='last')
        # Remove the temporary Sort Group column
        final_df = final_df.drop(columns=['Sort Group'])
        logging.info("Sorting complete.")
    else:
        logging.info("Skipping final sorting as DataFrame is empty.")


    # --- Save Final Result (Excel) ---
    if not final_df.empty:
        logging.info(f"Preparing final {len(final_df)} unique leads for saving...")

        # --- Add Missing 'Notes' and 'Email' Columns ---
        if 'Notes' not in final_df.columns:
            final_df['Notes'] = ""  # Add as empty string
            logging.info("Added empty 'Notes' column to the final DataFrame.")
        if 'Email' not in final_df.columns:
            final_df['Email'] = ""  # Add as empty string
            logging.info("Added empty 'Email' column to the final DataFrame.")

        # --- Define Final Column Order ---
        # Use the user-requested column order
        output_columns_order = [
            SOURCE_FILE_COLUMN,
            "Type of Business",
            "Sub-Category",
            "Name of Business",
            "Website",
            "# of Reviews",
            "Rating",
            "Latest Review",
            "Business Address",
            "Phone Number",
            "Notes",  # Include Notes
            "Email"   # Include Email
        ]

        # Ensure the source column exists before trying to include it in the ordering
        if SOURCE_FILE_COLUMN not in final_df.columns:
             logging.warning(f"Source column '{SOURCE_FILE_COLUMN}' not found in final DataFrame. It will be missing from the output.")
             # Remove it from the order list if it doesn't exist
             if SOURCE_FILE_COLUMN in output_columns_order:
                 output_columns_order.remove(SOURCE_FILE_COLUMN)

        # Determine the actual columns to include in the output file
        # Start with columns from the desired order that exist in the DataFrame
        final_output_columns = [col for col in output_columns_order if col in final_df.columns]
        # Add any remaining columns from final_df that weren't in the preferred order list
        # This ensures no data is lost if unexpected columns were generated
        final_output_columns += [col for col in final_df.columns if col not in final_output_columns]

        # Create the DataFrame with the final column order for saving
        final_df_to_save = final_df[final_output_columns]

        logging.info(f"Saving final DataFrame with columns: {', '.join(final_output_columns)} to '{output_file_path}'...")
        try:
            with pd.ExcelWriter(output_file_path, engine='xlsxwriter') as writer:
                final_df_to_save.to_excel(writer, index=False, sheet_name='Combined Leads')
                workbook = writer.book
                worksheet = writer.sheets['Combined Leads']
                # Apply column widths based on the final output columns and the column_widths dict
                for i, col_name in enumerate(final_df_to_save.columns):
                     # Use a default width (e.g., 15) if the column isn't in column_widths
                     width = column_widths.get(col_name, 15)
                     worksheet.set_column(i, i, width)
            logging.info(f"Successfully saved leads to '{output_file_path}'! ✅")
        except PermissionError:
            logging.error(f"Could not save '{output_file_path}'. Permission denied. Check if the file is open or if you have write access to the folder.")
        except KeyError as ke:
             logging.error(f"Column error during final save preparation: {ke}. Ensure all columns in 'output_columns_order' are handled correctly.")
        except Exception as e:
            logging.exception(f"Error saving final Excel file to '{output_file_path}': {e}")
    else:
        logging.warning(f"Final DataFrame empty. Nothing to save to '{output_file_path}'.")

# =================== RUN SCRIPT =================== #

if __name__ == "__main__":
    find_leads_by_zip()