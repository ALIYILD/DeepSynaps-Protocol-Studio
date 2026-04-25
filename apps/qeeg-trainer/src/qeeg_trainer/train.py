from __future__ import annotations

from pathlib import Path

import typer


app = typer.Typer(add_completion=False, help="Train qEEG condition-likelihood models.")


@app.command()
def main(
    task: str = typer.Option("adhd", help="Task key (e.g. adhd, depression)."),
    out_dir: Path = typer.Option(Path("./out"), help="Directory for exported weights."),
    dataset: str = typer.Option("tdbrain", help="Dataset key (tdbrain|tueg|nmt)."),
    data_path: Path = typer.Option(Path("/data/tdbrain"), help="Dataset root on disk."),
) -> None:
    """Minimal end-to-end example training loop (NeuralSet → braindecode/skorch)."""

    # Imports are local to keep CLI import fast and avoid expensive import-time side effects.
    import neuralset as ns
    import torch
    from braindecode import EEGClassifier
    from braindecode.models import Deep4Net
    from skorch.callbacks import EarlyStopping, LRScheduler
    from skorch.helper import predefined_split

    from qeeg_trainer.studies import NMTStudy, TDBrainStudy, TUEGStudy

    if dataset == "tdbrain":
        study = TDBrainStudy(path=data_path)
        label_col = "diagnosis"
    elif dataset == "tueg":
        study = TUEGStudy(path=data_path)
        label_col = "diagnosis"
    elif dataset == "nmt":
        study = NMTStudy(path=data_path)
        label_col = "diagnosis"
    else:
        raise typer.BadParameter("dataset must be one of: tdbrain, tueg, nmt")

    events = study.load_events()

    events = ns.events.transforms.SplitByLabel(
        column=label_col,
        train_frac=0.7,
        valid_frac=0.15,
        test_frac=0.15,
        seed=42,
    )(events)

    segmenter = ns.dataloader.Segmenter(
        start=0.0,
        duration=4.0,
        trigger_query="event_type == 'eyes_closed'",
        extractors={
            "eeg": ns.extractors.MneExtractor(frequency=256.0, n_channels=19),
            "label": ns.extractors.MetaExtractor(column=label_col),
        },
        drop_incomplete=True,
    )
    train_ds = segmenter(events.query("split == 'train'"))
    valid_ds = segmenter(events.query("split == 'valid'"))

    model = Deep4Net(
        n_chans=19,
        n_outputs=2,
        n_times=int(4.0 * 256),
        final_conv_length="auto",
    )

    clf = EEGClassifier(
        model,
        criterion=torch.nn.CrossEntropyLoss,
        optimizer=torch.optim.AdamW,
        optimizer__lr=1e-3,
        train_split=predefined_split(valid_ds),
        callbacks=[
            EarlyStopping(patience=10, monitor="valid_loss"),
            LRScheduler("CosineAnnealingLR", T_max=50),
        ],
        max_epochs=50,
        batch_size=64,
        device="cuda" if torch.cuda.is_available() else "cpu",
    )

    clf.fit(train_ds, y=None)

    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"{task}_deep4net.pt"
    torch.save(clf.module_.state_dict(), out)
    typer.echo(f"saved → {out}")


if __name__ == "__main__":
    app()

