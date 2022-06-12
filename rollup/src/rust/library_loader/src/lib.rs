use lazy_static::lazy_static;
use wasm_bindgen::prelude::*;
use web_sys::{ReadableStream, HtmlElement};

mod bin_io;
mod library_structs;
use library_structs::*;


lazy_static! {
	static ref WINDOW: web_sys::Window = web_sys::window().expect("global window");
	static ref DOCUMENT: web_sys::Document = WINDOW.document().expect("global document");
	static ref CREATE_ELEM: &'static fn = &DOCUMENT.create_element;
}

#[wasm_bindgen(start)]
pub fn loadLibrary() {
	let reader;
	let playlist = PlaylistIter::start(reader);
	let playlist_elem = document.get_element_by_id(format!("library-{}", playlist.name));
	for entry in playlist.content {
		let entry_elem = CREATE_ELEM("li");
		loadEntry(entry, entry_elem);
	}
}

fn loadEntry(entry: LibraryEntryIter, elem: HtmlElement) {
	//elem.set_text_content(Some("Hello from Rust!"));
	
	let children_elem = CREATE_ELEM("ul");
	for child_entry in entry.children {
		let child_elem = CREATE_ELEM("li");
		children_elem.append(child_elem);
		loadEntry(child_entry, child_elem);
	}
}
