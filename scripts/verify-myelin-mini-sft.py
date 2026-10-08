"""Verify TRL preserves audited tokens and masks. No training or model download."""
import json
from pathlib import Path

from datasets import Dataset
from transformers import AutoTokenizer, GPT2Config, GPT2LMHeadModel
from trl import SFTConfig, SFTTrainer

from myelin_mini_training_audit import tokenize_and_audit


tokenizer = AutoTokenizer.from_pretrained('principled-intelligence/Qwen3.5-0.8B-text-only')
rows = [json.loads(line) for line in Path('training/myelin-mini/compiled/balanced-v3-train.jsonl').read_text().splitlines()][:2]
tokens, report = tokenize_and_audit(rows, tokenizer, 768)
assert report['failedRows'] == 0
# A tiny random model exercises trainer initialization; no weights are downloaded
# and no optimizer step is taken. Its architecture does not test Qwen quality.
model = GPT2LMHeadModel(GPT2Config(vocab_size=len(tokenizer), n_positions=768,
    n_embd=8, n_layer=1, n_head=1, bos_token_id=tokenizer.bos_token_id,
    eos_token_id=tokenizer.eos_token_id))
trainer = SFTTrainer(model=model, processing_class=tokenizer,
    train_dataset=Dataset.from_list(tokens),
    args=SFTConfig(output_dir='/tmp/myelin-mini-sft-check', max_length=768,
        completion_only_loss=True, assistant_only_loss=False, packing=False,
        use_cpu=True, bf16=False, fp16=False, report_to='none'))
prepared = list(trainer.train_dataset)
assert sorted(r['input_ids'] for r in prepared) == sorted(r['input_ids'] for r in tokens)
assert sorted((r['input_ids'], r['completion_mask']) for r in prepared) == sorted(
    (r['input_ids'], r['completion_mask']) for r in tokens)
batch = trainer.data_collator(prepared)
for index, sample in enumerate(prepared):
    size = len(sample['input_ids'])
    assert batch['input_ids'][index, :size].tolist() == sample['input_ids']
    expected = [token if mask else -100 for token, mask in zip(sample['input_ids'], sample['completion_mask'])]
    assert batch['labels'][index, :size].tolist() == expected
    assert all(value == -100 for value in batch['labels'][index, size:].tolist())
print('PASS: TRL preserved complete tokens; prompt and padding masked; every completion token supervised')
