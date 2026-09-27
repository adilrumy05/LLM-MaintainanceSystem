"""OpenAI vision pricing — USD per 1 MILLION tokens.

Update MODEL_PRICING if you change VLM_MODEL or OpenAI changes pricing.
Cost is calculated from the ACTUAL token usage OpenAI returns per call, not
an estimate — see vlm.py, which reads resp.usage off every response.
"""

from typing import Tuple

MODEL_PRICING = {
    "gpt-4o-mini": {
        "input_per_1m": 0.15,
        "output_per_1m": 0.60,
    },
}


def get_model_pricing(model: str) -> Tuple[float, float]:
    """Return (input_price_per_1M, output_price_per_1M) for the given model."""
    if model not in MODEL_PRICING:
        raise ValueError(
            f"No pricing configured for model '{model}'. "
            f"Add it to MODEL_PRICING before running."
        )
    pricing = MODEL_PRICING[model]
    return pricing["input_per_1m"], pricing["output_per_1m"]


def calculate_cost(input_tokens: int, output_tokens: int, model: str) -> Tuple[float, float, float]:
    """Return (input_cost_usd, output_cost_usd, total_cost_usd)."""
    input_price_per_1m, output_price_per_1m = get_model_pricing(model)
    input_cost = (input_tokens / 1_000_000) * input_price_per_1m
    output_cost = (output_tokens / 1_000_000) * output_price_per_1m
    return input_cost, output_cost, input_cost + output_cost


def extract_usage(resp) -> Tuple[int, int, int]:
    """Pull (input_tokens, output_tokens, total_tokens) off an OpenAI chat
    completion response. Returns zeros if the response didn't carry usage
    (shouldn't normally happen, but never crash the pipeline over it)."""
    usage = getattr(resp, "usage", None)
    if usage is None:
        return 0, 0, 0
    input_tokens = int(getattr(usage, "prompt_tokens", 0) or 0)
    output_tokens = int(getattr(usage, "completion_tokens", 0) or 0)
    total_tokens = int(getattr(usage, "total_tokens", input_tokens + output_tokens) or 0)
    return input_tokens, output_tokens, total_tokens