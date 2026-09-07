# Training

## The ML anomaly filter doesn't have a "training run"

Isolation Forest here runs **online**: `.update()` then `.score()` per event, continuously, forever. There's no dataset assembled, no training/test split, no epoch, no checkpoint to roll back to — the model's notion of "normal" is always exactly "whatever it's seen so far." See `docs/research/ml-filter-design.md` for why this shape was chosen given the lack of any labeled dataset.

## The one real training run in this project: the LoRA fine-tune attempt

This did have a conventional training process — assembled a dataset, ran a LoRA fine-tune of the local classifier model, then shadow-tested it against real production severities before considering promoting it. Result: it called LOW on 100% of real HIGH/CRITICAL test cases — worse than the untouched base model. Root cause: near-zero real CRITICAL/HIGH examples existed to train on, because genuine attacks are rare in this traffic by nature. Full writeup, including exactly what was tried and why it's shelved rather than abandoned: `docs/research/fine-tuning.md`.
