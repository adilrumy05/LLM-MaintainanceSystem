# llm_table_normalizer.py
"""
LLM-based table normalisation (optional path).

Only imported / used when TABLE_PARSE_MODE = "llm" in the notebook.
Uses a locally loaded HuggingFace CausalLM (Qwen or similar).

Public API
----------
normalize_table_with_llm(html_or_md_table, model, tokenizer) -> str
normalize_tables_in_markdown(md_text, model, tokenizer)
    -> (cleaned_md: str, table_records: list[dict])
"""

import re
from typing import Optional

SYSTEM_PROMPT = """You are a deterministic extractor for document tables.
Your task is to convert HTML or Markdown tables into structured plain text records.
You MUST ONLY extract what is present in the table.
You MUST NOT explain, summarize, validate, or comment.
You MUST NOT fix HTML or describe what you are doing.

STRICT RULES:
- Use ONLY information present in the source.
- Do NOT guess, infer, or add any values.
- Keep numbers, units, symbols exactly as they appear.
- If a value is missing: write [EMPTY]
- If text is unclear or OCR corrupted: write [UNCLEAR: ...]
- Output plain text only. No HTML. No Markdown.
- Do NOT repeat the same row or field multiple times.
- Ignore irrelevant content, decorative rows, or duplicated repeats.

TABLE TYPES:
- Label-Value table → output each pair as:  FACT: <label> = <value>
- Header + rows table → output each row as: ROW: <col1> | <col2> | <col3>
- Mixed / hierarchical → use SECTION: <n> to group, then FACT or ROW lines."""

USER_PROMPT_TEMPLATE = """Extract all data from the table below and output as plain text records.

OUTPUT FORMAT (strict):
SECTION: <n>             (only if the table has clearly labeled groups)
FACT: <key> = <value>    (for label-value pairs)
ROW: <v1> | <v2> | <v3> (for row-based tables — include header row first)

IMPORTANT:
- For merged cells (rowspan/colspan), extract each labeled item as its own FACT.
- Only output data that appears in the content.
- Do NOT add explanations before or after the output.

TABLE:
{table_content}"""


def normalize_table_with_llm(
    table_content: str,
    model,
    tokenizer,
    max_new_tokens: int = 512,
    temperature: float = 0.1,
) -> Optional[str]:
    import torch

    user_msg = USER_PROMPT_TEMPLATE.format(table_content=table_content.strip())

    try:
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": user_msg},
        ]
        prompt = tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True,
        )
    except Exception:
        prompt = f"{SYSTEM_PROMPT}\n\n{user_msg}"

    inputs = tokenizer(prompt, return_tensors="pt").to(model.device)

    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            do_sample=False,
            temperature=temperature,
            pad_token_id=tokenizer.eos_token_id,
        )

    input_len  = inputs["input_ids"].shape[1]
    new_tokens = outputs[0][input_len:]
    result     = tokenizer.decode(new_tokens, skip_special_tokens=True).strip()
    return result if result else None


_HTML_TABLE_RE = re.compile(r"<table[\s\S]*?</table>", re.IGNORECASE)


def normalize_tables_in_markdown(
    md_text: str,
    model,
    tokenizer,
    max_new_tokens: int = 512,
) -> tuple:
    """
    Replace every HTML table in md_text with LLM-normalised FACT/ROW text.

    Returns (cleaned_md, table_records)
    table_records entries:
        table_index, normalised (str), success (bool), char_start, char_end
    """
    matches       = list(_HTML_TABLE_RE.finditer(md_text))
    table_records = []

    if not matches:
        return md_text, []

    print(f"         {len(matches)} HTML table(s) — LLM normalising...")

    result_text = md_text
    offset      = 0

    for idx, match in enumerate(matches):
        html_src   = match.group(0)
        start, end = match.start(), match.end()

        normalised = None
        success    = False
        try:
            normalised = normalize_table_with_llm(
                html_src, model, tokenizer, max_new_tokens=max_new_tokens,
            )
            success = bool(normalised)
        except Exception as e:
            print(f"            LLM failed table {idx + 1}: {e}")

        if normalised:
            replacement = f"\n<!-- TABLE {idx + 1} -->\n{normalised}\n"
        else:
            normalised  = ""
            replacement = f"\n<!-- TABLE {idx + 1} LLM FAILED -->\n"

        adj_start   = start + offset
        adj_end     = end   + offset
        result_text = result_text[:adj_start] + replacement + result_text[adj_end:]
        offset     += len(replacement) - (end - start)

        table_records.append({
            "table_index": idx,
            "normalised":  normalised,
            "success":     success,
            "char_start":  start,
            "char_end":    end,
        })

    return result_text, table_records